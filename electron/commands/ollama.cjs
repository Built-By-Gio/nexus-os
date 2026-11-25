const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const HOST = "http://127.0.0.1:11434";
const MODEL = "qwen3.5:9b";
const NUM_CTX = 16384;

let mainWindow = null;
function setWindow(win) { mainWindow = win; }

function exePath() {
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    ...String(process.env.PATH || "").split(path.delimiter).map((d) => path.join(d, process.platform === "win32" ? "ollama.exe" : "ollama")),
  ].filter(Boolean);
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

async function api(route, init = {}, timeoutMs = 4000) {
  return fetch(HOST + route, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) });
}

async function running() {
  try { return (await api("/api/version", {}, 1500)).ok; } catch { return false; }
}

async function hasModel() {
  try {
    const { models = [] } = await (await api("/api/tags")).json();
    return models.some((m) => m.name === MODEL || m.model === MODEL);
  } catch { return false; }
}

async function ollama_status() {
  const up = await running();
  return { installed: !!exePath() || up, running: up, model: up && await hasModel(), name: MODEL };
}

async function ollama_start() {
  if (await running()) return true;
  const exe = exePath();
  if (!exe) throw new Error("Ollama isn't installed.");
  // CUDA 13 crashes about one cold load in five on the RTX PRO 1000 here; CUDA 12 didn't once in eight.
  const nvidia = process.platform === "win32" && fs.existsSync("C:\\Windows\\System32\\nvidia-smi.exe");
  const env = nvidia ? { ...process.env, OLLAMA_LLM_LIBRARY: "cuda_v12" } : process.env;
  spawn(exe, ["serve"], { detached: true, stdio: "ignore", windowsHide: true, env }).unref();
  for (let i = 0; i < 40; i++) {
    if (await running()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Ollama didn't start.");
}

async function ollama_pull() {
  const res = await api("/api/pull", { method: "POST", body: JSON.stringify({ model: MODEL, stream: true }) }, 6 * 60 * 60 * 1000);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const p = JSON.parse(line);
      if (p.error) throw new Error(p.error);
      mainWindow?.webContents.send("ollama:pull", { status: p.status, total: p.total || 0, completed: p.completed || 0 });
    }
  }
  return hasModel();
}

function textOf(content) {
  if (typeof content === "string") return content;
  return (content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
}

function toOllamaMessages(system, messages) {
  const out = [];
  const sys = textOf(system);
  if (sys) out.push({ role: "system", content: sys });
  const toolNames = new Map();
  for (const m of messages || []) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content || [];
    const results = blocks.filter((b) => b.type === "tool_result");
    for (const r of results) {
      out.push({ role: "tool", tool_name: toolNames.get(r.tool_use_id) || "", content: textOf(r.content) || String(r.content ?? "") });
    }
    const text = textOf(blocks);
    const images = blocks.filter((b) => b.type === "image" && b.source?.data).map((b) => b.source.data);
    const calls = blocks.filter((b) => b.type === "tool_use");
    calls.forEach((c) => toolNames.set(c.id, c.name));
    if (!text && !images.length && !calls.length) continue;
    const msg = { role: m.role, content: text };
    if (images.length) msg.images = images;
    if (calls.length) msg.tool_calls = calls.map((c) => ({ function: { name: c.name, arguments: c.input || {} } }));
    out.push(msg);
  }
  return out;
}

function toOllamaTools(tools) {
  return (tools || [])
    .filter((t) => !t.type && t.name)
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } } }));
}

async function chat(request) {
  let res;
  try {
    res = await api("/api/chat", { method: "POST", body: JSON.stringify(request) }, 10 * 60 * 1000);
  } catch {
    throw new Error("NO_ENGINE");
  }
  return { res, data: await res.json().catch(() => ({})) };
}

async function call_model({ payload }) {
  const body = JSON.parse(payload.body);
  const tools = toOllamaTools(body.tools);
  const request = {
    model: MODEL,
    messages: toOllamaMessages(body.system, body.messages),
    ...(tools.length ? { tools } : {}),
    stream: false,
    think: false,
    keep_alive: "30m",
    options: { num_ctx: NUM_CTX, num_predict: body.max_tokens || 1000 },
  };
  let { res, data } = await chat(request);
  if (!res.ok && /process has terminated|Load failed/i.test(data.error || "")) ({ res, data } = await chat(request));
  if (!res.ok) {
    if (res.status === 404 || /not found/i.test(data.error || "")) throw new Error("NO_MODEL");
    throw new Error(data.error || `model returned ${res.status}`);
  }

  const msg = data.message || {};
  const text = String(msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const content = [];
  if (text) content.push({ type: "text", text });
  for (const c of msg.tool_calls || []) {
    let input = c.function?.arguments ?? {};
    if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = {}; } }
    content.push({ type: "tool_use", id: "toolu_" + crypto.randomBytes(8).toString("hex"), name: c.function?.name, input });
  }
  const stop = (msg.tool_calls || []).length ? "tool_use" : data.done_reason === "length" ? "max_tokens" : "end_turn";
  return JSON.stringify({
    type: "message", role: "assistant", model: MODEL, content, stop_reason: stop,
    usage: { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 },
  });
}

module.exports = { setWindow, call_model, ollama_status, ollama_start, ollama_pull, MODEL };
