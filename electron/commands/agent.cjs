const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { app } = require("electron");
const execFileAsync = promisify(execFile);

const MAX_CAPTURE = 24_000;
const HEAD_KEEP = 6_000;

let mainWindow = null;
function setWindow(win) { mainWindow = win; }

const running = new Map();    // run_id -> child process
const cancelled = new Set();  // run_id
let guardEnabled = true;

const FORBIDDEN = [
  "rm -rf /", "rm -rf /*", "rm -fr /", ":(){:|:&};:", "mkfs.",
  "dd if=/dev/zero of=/dev/", "dd if=/dev/random of=/dev/", "> /dev/sda",
  "format c:", "del /f /s /q c:\\", "rd /s /q c:\\", "diskpart",
  "cipher /w:c", "vssadmin delete shadows", "bcdedit /set",
  "reg delete hklm", "shutdown", "chmod -r 777 /", "chown -r", "history -c",
];

function guardVerdict(cmd) {
  const flat = cmd.toLowerCase().replace(/\u00a0/g, " ");
  const squished = flat.split(/\s+/).filter(Boolean).join(" ");
  for (const bad of FORBIDDEN) {
    if (squished.includes(bad)) {
      return `BLOCKED by the Nexus agent guard: this command matches the destructive pattern "${bad}". ` +
        `It was not run. If this really is what you meant, tell the user what you want to run and why, ` +
        `and let them run it themselves or switch the guard off in Agent Mode.`;
    }
  }
  return null;
}

function home() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir() || ".";
}

function squeeze(s) {
  if (s.length <= MAX_CAPTURE) return [s, false];
  const headEnd = HEAD_KEEP;
  const tailStart = Math.max(headEnd, s.length - (MAX_CAPTURE - HEAD_KEEP));
  const head = s.slice(0, headEnd);
  const tail = s.slice(tailStart);
  const dropped = tailStart - headEnd;
  return [`${head}\n\n... [${dropped} bytes of output omitted from the middle] ...\n\n${tail}`, true];
}

function makeLineFeeder(onLine, onHeartbeat) {
  let buf = "";
  return function feed(chunkStr) {
    for (const ch of chunkStr) {
      if (ch === "\n" || ch === "\r") {
        onHeartbeat();
        if (buf.trim() !== "") onLine(buf);
        buf = "";
      } else {
        buf += ch;
        if (buf.length > 8192) { onHeartbeat(); onLine.raw?.(buf); buf = ""; }
      }
    }
    return buf;
  };
}

function agent_exec({ run_id, cmd, cwd, timeout_secs, quiet_secs }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const trimmed = (cmd || "").trim();
    if (!trimmed) return reject(new Error("Empty command."));
    if (cancelled.has(run_id)) return reject(new Error("Run was stopped by the user."));

    if (guardEnabled) {
      const reason = guardVerdict(trimmed);
      if (reason) {
        mainWindow?.webContents.send("agent:output", { run_id, stream: "err", line: reason });
        return reject(new Error(reason));
      }
    }

    const dir = cwd && cwd.trim() ? cwd : home();
    const win = process.platform === "win32";

    let child;
    try {
      // cmd.exe doesn't understand Node's \" escaping, so pass the line verbatim the way shell:true does.
      child = win
        ? spawn("cmd", ["/d", "/s", "/c", `"${trimmed}"`], { cwd: dir, windowsHide: true, windowsVerbatimArguments: true, stdio: ["ignore", "pipe", "pipe"] })
        : spawn("sh", ["-c", trimmed], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return reject(new Error(`failed to start '${cmd}': ${e.message}`));
    }
    running.set(run_id, child);

    let stdoutBuf = "", stderrBuf = "";
    let lastOut = Date.now();
    const heartbeat = () => { lastOut = Date.now(); };

    const outFeed = makeLineFeeder((line) => {
      stdoutBuf += line + "\n";
      mainWindow?.webContents.send("agent:output", { run_id, stream: "out", line });
    }, heartbeat);
    outFeed.raw = (chunk) => { stdoutBuf += chunk; };
    const errFeed = makeLineFeeder((line) => {
      stderrBuf += line + "\n";
      mainWindow?.webContents.send("agent:output", { run_id, stream: "err", line });
    }, heartbeat);
    errFeed.raw = (chunk) => { stderrBuf += chunk; };

    let outLeftover = "", errLeftover = "";
    child.stdout.on("data", (d) => { outLeftover = outFeed(d.toString("utf8")); });
    child.stderr.on("data", (d) => { errLeftover = errFeed(d.toString("utf8")); });

    const hardLimitMs = Math.min(Math.max((timeout_secs || 3600), 5), 14_400) * 1000;
    const quietLimitMs = Math.min(Math.max((quiet_secs || 120), 10), 3600) * 1000;

    let settled = false;
    let endReason = "exited";

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      running.delete(run_id);
      if (outLeftover.trim()) stdoutBuf += outLeftover + "\n";
      if (errLeftover.trim()) stderrBuf += errLeftover + "\n";
      const [stdout, t1] = squeeze(stdoutBuf);
      const [stderr, t2] = squeeze(stderrBuf);
      resolve({
        stdout, stderr, code,
        end_reason: endReason,
        truncated: t1 || t2,
        duration_ms: Date.now() - started,
        silent_ms: Date.now() - lastOut,
      });
    };

    const killTree = () => {
      const pid = child.pid;
      if (process.platform === "win32") {
        try { require("child_process").execFileSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true }); } catch { /* already gone */ }
      } else {
        try { require("child_process").execFileSync("pkill", ["-TERM", "-P", String(pid)]); } catch { /* already gone */ }
      }
      try { child.kill(); } catch { /* already gone */ }
    };

    const watchdog = setInterval(() => {
      if (settled) return;
      if (cancelled.has(run_id)) { endReason = "stopped"; killTree(); }
      else if (Date.now() - lastOut > quietLimitMs) { endReason = "stalled"; killTree(); }
      else if (Date.now() - started > hardLimitMs) { endReason = "over_time"; killTree(); }
    }, 200);

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      running.delete(run_id);
      reject(new Error(`lost track of the process: ${e.message}`));
    });

    child.on("exit", (code) => {
      finish(endReason === "exited" ? (code ?? -1) : -1);
    });
  });
}

async function agent_stop({ run_id }) {
  cancelled.add(run_id);
  const child = running.get(run_id);
  if (child) {
    if (process.platform === "win32") {
      try { await execFileAsync("taskkill", ["/T", "/F", "/PID", String(child.pid)]); } catch { /* already gone */ }
    } else {
      try { await execFileAsync("pkill", ["-TERM", "-P", String(child.pid)]); } catch { /* already gone */ }
    }
    try { child.kill(); } catch { /* already gone */ }
  }
}

async function agent_reset({ run_id }) { cancelled.delete(run_id); }
async function agent_set_guard({ enabled }) { guardEnabled = !!enabled; }
async function agent_guard_enabled() { return guardEnabled; }

async function agent_write_file({ path: filePath, contents, append }) {
  const p = path.resolve(filePath);
  await fsp.mkdir(path.dirname(p), { recursive: true }).catch(() => {});
  if (append) {
    await fsp.appendFile(p, contents);
    return `Appended ${Buffer.byteLength(contents)} bytes to ${filePath}.`;
  }
  await fsp.writeFile(p, contents);
  return `Wrote ${Buffer.byteLength(contents)} bytes to ${filePath}.`;
}

async function agent_read_file({ path: filePath }) {
  const stat = await fsp.stat(filePath).catch((e) => { throw new Error(`can't stat ${filePath}: ${e.message}`); });
  if (stat.size > 400_000) throw new Error(`${filePath} is ${stat.size} bytes \u2014 too large to read in one go.`);
  const raw = await fsp.readFile(filePath, "utf8").catch((e) => { throw new Error(`can't read ${filePath}: ${e.message}`); });
  const [text] = squeeze(raw);
  return text;
}

function journalPath(runId) {
  const safe = String(runId).replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(app.getPath("userData"), "agent", `${safe}.jsonl`);
}

async function agent_journal_append({ run_id, entry }) {
  const p = journalPath(run_id);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.appendFile(p, entry.replace(/\n/g, "\\n") + "\n");
}

async function agent_journal_read({ run_id }) {
  try {
    const text = await fsp.readFile(journalPath(run_id), "utf8");
    return text.split("\n").filter((l) => l.length);
  } catch { return []; }
}

async function agent_journal_list() {
  const dir = path.join(app.getPath("userData"), "agent");
  let entries;
  try { entries = await fsp.readdir(dir); } catch { return []; }
  const runs = entries.filter((n) => n.endsWith(".jsonl")).map((n) => n.slice(0, -6));
  runs.sort().reverse();
  return runs;
}

async function agent_journal_clear({ run_id }) {
  await fsp.rm(journalPath(run_id), { force: true });
}

const PROBE_CANDIDATES = [
  "git", "python", "python3", "py", "pip", "pip3", "node", "npm",
  "cargo", "docker", "curl", "wget", "winget", "choco", "scoop", "brew",
];

async function agent_probe_env() {
  const checks = PROBE_CANDIDATES.map(async (tool) => {
    try {
      if (process.platform === "win32") {
        const { stdout } = await execFileAsync("where", [tool], { windowsHide: true });
        return stdout.trim() ? tool : null;
      }
      const { stdout } = await execFileAsync("sh", ["-c", `command -v ${tool}`]);
      return stdout.trim() ? tool : null;
    } catch { return null; }
  });
  const found = (await Promise.all(checks)).filter(Boolean);

  return {
    os: process.platform === "win32" ? "windows" : process.platform,
    arch: process.arch,
    shell: process.platform === "win32" ? "cmd" : "sh",
    home: home(),
    cwd: process.cwd(),
    tools: found,
  };
}

module.exports = {
  setWindow, agent_exec, agent_stop, agent_reset, agent_set_guard, agent_guard_enabled,
  agent_write_file, agent_read_file, agent_journal_append, agent_journal_read,
  agent_journal_list, agent_journal_clear, agent_probe_env,
};
