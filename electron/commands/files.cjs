const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const exifr = require("exifr");
const sharp = require("sharp");

function dirsHome() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir() || ".";
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function relTime(mtimeMs) {
  const s = Math.max(0, (Date.now() - mtimeMs) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const TEXT_EXTS = new Set(["md", "txt", "rs", "js", "jsx", "ts", "tsx", "py", "json", "toml", "css", "html", "csv", "log"]);

function walkDir(dir, root, depth, out) {
  if (out.length >= 2000) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (out.length >= 2000) return;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (depth > 0) walkDir(full, root, depth - 1, out);
      continue;
    }
    if (!entry.isFile()) continue;

    let stat;
    try { stat = fs.statSync(full); } catch { continue; }

    const ext = path.extname(entry.name).slice(1).toLowerCase();
    const relParent = path.relative(root, path.dirname(full)) || ".";

    let body = null;
    if (TEXT_EXTS.has(ext) && stat.size < 200_000) {
      try { body = fs.readFileSync(full, "utf8").slice(0, 20_000); } catch { /* unreadable */ }
    }

    out.push({
      id: full, name: entry.name, path: relParent,
      type: ext || "file",
      size: humanSize(stat.size), when: relTime(stat.mtimeMs),
      tags: [], body,
    });
  }
}

async function index_folder({ path: folderPath, recursive }) {
  const root = folderPath;
  let stat;
  try { stat = fs.statSync(root); } catch { throw new Error("That path isn't a folder."); }
  if (!stat.isDirectory()) throw new Error("That path isn't a folder.");
  const out = [];
  walkDir(root, root, recursive ? 4 : 0, out);
  return out;
}

const SKIP_DIRS = new Set([
  "appdata", "node_modules", ".git", ".cache", ".npm", ".rustup", ".cargo",
  "target", "$recycle.bin", "windows", "program files", "program files (x86)",
  "programdata", "system volume information", ".vscode", ".idea",
]);

async function find_folders({ query }) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return [];

  const home = dirsHome();
  const stack = [[home, 6]];
  const root = path.parse(home).root;
  if (root && root !== home) stack.push([root, 2]);

  const hits = [];
  let budget = 60_000;

  while (stack.length && budget > 0 && hits.length < 80) {
    const [dir, depth] = stack.pop();
    budget -= 1;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lname = entry.name.toLowerCase();
      if (SKIP_DIRS.has(lname)) continue;
      const full = path.join(dir, entry.name);

      if (lname.includes(q)) {
        hits.push({ name: entry.name, path: full, parent: dir });
        if (hits.length >= 80) break;
      }
      if (depth > 1) stack.push([full, depth - 1]);
    }
  }

  hits.sort((a, b) => a.path.length - b.path.length || a.name.localeCompare(b.name));
  const seen = new Set();
  return hits.filter((h) => (seen.has(h.path) ? false : (seen.add(h.path), true)));
}

function entriesToMeta(obj) {
  const out = [];
  for (const [tag, raw] of Object.entries(obj || {})) {
    if (raw == null) continue;
    let value;
    if (raw instanceof Date) value = raw.toISOString();
    else if (Array.isArray(raw)) value = raw.join(", ");
    else if (typeof raw === "object") continue; // skip binary/thumbnail blobs
    else value = String(raw);
    if (value !== "" && value !== '""') out.push({ tag, value });
  }
  return out;
}

async function read_metadata({ path: filePath }) {
  let parsed;
  try { parsed = await exifr.parse(filePath, true); }
  catch { parsed = null; }
  if (!parsed) throw new Error("No EXIF metadata found in this file (JPEG/TIFF/HEIC hold EXIF; PNG/GIF usually don't).");
  const out = entriesToMeta(parsed);
  if (!out.length) throw new Error("No readable metadata fields.");
  return out;
}

async function read_metadata_bytes({ bytes }) {
  const buf = Buffer.from(bytes);
  let parsed;
  try { parsed = await exifr.parse(buf, true); }
  catch { parsed = null; }
  if (!parsed) throw new Error("No EXIF metadata found (JPEG/TIFF/HEIC hold EXIF; PNG/GIF usually don't).");
  const out = entriesToMeta(parsed);
  if (!out.length) throw new Error("No readable metadata fields.");
  return out;
}

async function strip_metadata_bytes({ bytes }) {
  const buf = Buffer.from(bytes);
  try {
    const out = await sharp(buf).png().toBuffer();
    return Array.from(out);
  } catch (e) { throw new Error(`couldn't encode: ${e.message}`); }
}

async function strip_metadata({ path: filePath }) {
  const parsed = path.parse(filePath);
  const outPath = path.join(parsed.dir, `${parsed.name}-clean${parsed.ext}`);
  try {
    await sharp(filePath).toFile(outPath);
  } catch (e) { throw new Error(`couldn't read/save image: ${e.message}`); }
  return outPath;
}

module.exports = { index_folder, find_folders, read_metadata, read_metadata_bytes, strip_metadata, strip_metadata_bytes };
