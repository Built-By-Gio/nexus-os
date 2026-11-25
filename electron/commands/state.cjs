const { app } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

function userDataDir() {
  return app.getPath("userData");
}

function statePath(key) {
  const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(userDataDir(), "state", `${safe}.json`);
}

async function load_state({ key }) {
  try {
    return await fsp.readFile(statePath(key), "utf8");
  } catch {
    return "null";
  }
}

async function save_state({ key, value }) {
  const p = statePath(key);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, value);
}

async function factory_reset() {
  const dir = userDataDir();
  let entries;
  try { entries = await fsp.readdir(dir); } catch { return; }
  for (const name of entries) {
    if (name === "EBWebView" || name === "Cache" || name === "blob_storage") continue;
    const p = path.join(dir, name);
    await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

function elevenKeyPath() { return path.join(userDataDir(), "eleven.key"); }

function readElevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const k = fs.readFileSync(elevenKeyPath(), "utf8").trim();
    return k || null;
  } catch { return null; }
}

async function save_eleven_key({ key }) {
  const k = (key || "").trim();
  if (!k) throw new Error("The key is empty.");
  await fsp.mkdir(path.dirname(elevenKeyPath()), { recursive: true });
  await fsp.writeFile(elevenKeyPath(), k);
}

async function clear_eleven_key() {
  await fsp.rm(elevenKeyPath(), { force: true });
}

async function has_eleven_key() { return readElevenKey() != null; }

module.exports = {
  load_state, save_state, factory_reset,
  save_eleven_key, clear_eleven_key, has_eleven_key,
  readElevenKey,
};
