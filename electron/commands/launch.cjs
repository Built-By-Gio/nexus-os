const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fsp = require("fs/promises");
const execFileAsync = promisify(execFile);

async function launch_app({ target }) {
  const t = (target || "").trim();
  if (!t) throw new Error("Nothing to launch.");

  if (t.toLowerCase().includes("windowsapps")) {
    const low = t.toLowerCase();
    const hint = low.includes("spotify") ? "  Try  spotify:  instead."
      : low.includes("windowsterminal") ? "  Try  wt  instead."
      : "  Use the app's protocol or start-menu name (e.g. its URI) rather than the .exe path.";
    throw new Error(`Windows blocks launching Store apps by their WindowsApps path.${hint}`);
  }

  // `start` searches PATH and app registrations, so bare names like "taskmgr" or protocols like
  // "ms-settings:" resolve. shell.openPath only opens real file paths.
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/C", "start", "", t], { windowsHide: true, detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [t], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [t], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (e) {
    throw new Error(`Could not launch '${t}': ${e.message || e}`);
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function git(repoPath, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args]);
    return stdout;
  } catch (e) {
    throw new Error((e.stderr || e.message || "git not available").toString().trim());
  }
}

async function git_info({ path: repoPath }) {
  try { await git(repoPath, ["rev-parse", "--is-inside-work-tree"]); }
  catch { throw new Error("That folder isn't a git repository."); }

  const branch = (await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")).trim();

  let ahead = 0, behind = 0;
  try {
    const counts = await git(repoPath, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
    const nums = counts.trim().split(/\s+/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    if (nums.length === 2) { behind = nums[0]; ahead = nums[1]; }
  } catch { /* no upstream */ }

  const dirty = (await git(repoPath, ["status", "--porcelain"]).catch(() => ""))
    .split("\n").map((l) => l.slice(3)).filter(Boolean).slice(0, 50);

  const log = await git(repoPath, ["log", "-15", "--pretty=format:%h|%s|%an|%cr"]).catch(() => "");
  const commits = log.split("\n").filter(Boolean).map((l) => {
    const p = l.split("|");
    return p.length === 4 ? { sha: p[0], msg: p[1], who: p[2], when: p[3] } : null;
  }).filter(Boolean);

  const tracked = await git(repoPath, ["ls-files"]).catch(() => "");
  const relFiles = tracked.split("\n").filter(Boolean).slice(0, 200);
  const files = [];
  for (const rel of relFiles) {
    try {
      const st = await fsp.stat(path.join(repoPath, rel));
      files.push({ path: rel, size: humanSize(st.size) });
    } catch {
      files.push({ path: rel, size: "—" });
    }
  }

  const remote = (await git(repoPath, ["remote", "get-url", "origin"]).catch(() => "")).trim();

  return { branch, ahead, behind, dirty, commits, files, remote };
}

module.exports = { launch_app, git_info };
