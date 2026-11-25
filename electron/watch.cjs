const { spawn } = require("child_process");

// Every process Nexus spawns flashes the Windows busy cursor, so anything
// polled runs as one long-lived process that streams lines instead.
const all = new Set();

function watch(cmd, args, onLine) {
  let child = null;
  let fails = 0;
  let stopped = false;
  const start = () => {
    child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let buf = "";
    child.stdout.on("data", (d) => {
      fails = 0;
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
    });
    child.on("error", () => {});
    child.on("exit", () => {
      child = null;
      if (!stopped && ++fails <= 3) setTimeout(start, 5000 * fails);
    });
  };
  const w = {
    alive: () => !!child,
    stop: () => { stopped = true; child?.kill(); all.delete(w); },
  };
  all.add(w);
  start();
  return w;
}

function stopAll() {
  for (const w of [...all]) w.stop();
}

module.exports = { watch, stopAll };
