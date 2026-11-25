const { exec } = require("child_process");
const os = require("os");

function dirsHome() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir() || ".";
}

function run_shell({ cmd, cwd }) {
  return new Promise((resolve) => {
    const trimmed = (cmd || "").trim();
    if (!trimmed) return resolve({ stdout: "", stderr: "", code: 0 });

    const dir = cwd && cwd.trim() ? cwd : dirsHome();
    const shellCmd = process.platform === "win32" ? trimmed : trimmed;

    exec(shellCmd, {
      cwd: dir,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || "",
        stderr: stderr || (err && !stdout ? String(err.message) : ""),
        code: err ? (typeof err.code === "number" ? err.code : -1) : 0,
      });
    });
  });
}

module.exports = { run_shell, dirsHome };
