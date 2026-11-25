const si = require("systeminformation");
const dgram = require("dgram");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { watch } = require("../watch.cjs");
const execFileAsync = promisify(execFile);

let lastNet = null;
let lastRate = { down: 0, up: 0 };
let diskCache = { pct: 0, when: 0 };
let tempCache = { value: null, when: 0, supported: true };
let inflight = null;

async function diskPct() {
  if (Date.now() - diskCache.when < 60_000) return diskCache.pct;
  const root = process.platform === "win32" ? (process.env.SystemDrive || "C:") + "\\" : "/";
  const s = await fs.promises.statfs(root).catch(() => null);
  diskCache = { pct: s && s.blocks > 0 ? ((s.blocks - s.bavail) / s.blocks) * 100 : 0, when: Date.now() };
  return diskCache.pct;
}

async function cpuTemp() {
  if (!tempCache.supported || Date.now() - tempCache.when < 15_000) return tempCache.value;
  const t = await si.cpuTemperature().catch(() => ({ main: null }));
  const value = typeof t.main === "number" && t.main > 0 ? t.main : null;
  tempCache = { value, when: Date.now(), supported: value !== null };
  return value;
}

const NET_PS = "while($true){$r=0;$t=0;Get-NetAdapterStatistics -EA SilentlyContinue|%{$r+=$_.ReceivedBytes;$t+=$_.SentBytes};\"$r $t\";Start-Sleep -Milliseconds 1000}";
let netWatch = null;
let netLatest = null;

async function netstatBytes() {
  const { stdout } = await execFileAsync("netstat", ["-e"], { windowsHide: true });
  const row = stdout.split("\n").find((l) => /^\s*Bytes\s+\d+\s+\d+/.test(l));
  if (!row) return null;
  const [, rx, tx] = row.trim().split(/\s+/).map(Number);
  return { rx, tx };
}

async function netBytes() {
  if (process.platform === "win32") {
    netWatch ??= watch("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", NET_PS], (line) => {
      const [rx, tx] = line.split(" ").map(Number);
      if (rx > 0) netLatest = { rx, tx, when: Date.now() };
      else netWatch.stop();
    });
    return netWatch.alive() ? netLatest : netstatBytes();
  }
  const stats = await si.networkStats();
  return stats.reduce((s, n) => ({ rx: s.rx + (n.rx_bytes || 0), tx: s.tx + (n.tx_bytes || 0) }), { rx: 0, tx: 0 });
}

async function readTelemetry() {
  const [load, disk, temp, net] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: 0 })),
    diskPct(),
    cpuTemp(),
    netBytes().catch(() => null),
  ]);

  const total = os.totalmem();
  const used = total - os.freemem();

  let down = 0, up = 0;
  const now = net?.when || Date.now();
  if (net && lastNet && now > lastNet.when) {
    const elapsed = Math.max((now - lastNet.when) / 1000, 0.001);
    down = Math.max(((net.rx - lastNet.rx) * 8) / 1_000_000 / elapsed, 0);
    up = Math.max(((net.tx - lastNet.tx) * 8) / 1_000_000 / elapsed, 0);
    lastRate = { down, up };
  } else if (net && lastNet) {
    ({ down, up } = lastRate);
  }
  if (net && (!lastNet || now > lastNet.when)) lastNet = { ...net, when: now };

  return {
    cpu: load.currentLoad || 0,
    mem: (used / total) * 100,
    disk, temp, down, up,
    total_mem_gb: total / 1_073_741_824,
    used_mem_gb: used / 1_073_741_824,
  };
}

function telemetry() {
  inflight ??= readTelemetry().finally(() => { inflight = null; });
  return inflight;
}

async function system_snapshot() {
  let ports = [];
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("netstat", ["-an"]);
      for (const line of stdout.split("\n")) {
        const l = line.trim();
        if (!l.startsWith("TCP") || !l.includes("LISTENING")) continue;
        const local = l.split(/\s+/)[1];
        const p = local?.split(":").pop();
        const n = parseInt(p, 10);
        if (!isNaN(n) && !ports.includes(n)) ports.push(n);
      }
    } catch { /* netstat unavailable */ }
  }
  ports.sort((a, b) => a - b);

  const procs = await si.processes().catch(() => ({ list: [], all: 0 }));
  const top = [...(procs.list || [])]
    .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
    .slice(0, 8)
    .map((p) => ({ name: p.name, mem_mb: Math.round((p.memRss || 0) / 1024) }));

  return { ports, proc_count: procs.all || (procs.list || []).length, top };
}

async function net_info() {
  const local_ip = await new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    sock.connect(80, "8.8.8.8", () => {
      const addr = sock.address().address;
      sock.close();
      resolve(addr || "unavailable");
    });
    sock.on("error", () => resolve("unavailable"));
  });

  let gateway = "unavailable";
  let iface = "Primary adapter";
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("ipconfig");
      for (const line of stdout.split("\n")) {
        if (line.toLowerCase().includes("default gateway")) {
          const v = line.split(":")[1]?.trim();
          if (v && v.includes(".")) { gateway = v; break; }
        }
      }
    } catch { /* ipconfig unavailable */ }
  } else {
    try {
      const { stdout } = await execFileAsync("sh", ["-c", "ip route | awk '/default/{print $3; exit}'"]);
      gateway = stdout.trim() || "unavailable";
      const { stdout: ifc } = await execFileAsync("sh", ["-c", "ip route | awk '/default/{print $5; exit}'"]);
      iface = ifc.trim() || "unknown";
    } catch { /* not linux/no ip route */ }
  }

  return { local_ip, gateway, iface };
}

function wifiField(text, key) {
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    if (k.toLowerCase() === key.toLowerCase()) return line.slice(idx + 1).trim();
  }
  return "";
}

async function wifi_info() {
  if (process.platform !== "win32") {
    return { connected: null, networks: [], supported: false };
  }
  let iface = "";
  try { ({ stdout: iface } = await execFileAsync("netsh", ["wlan", "show", "interfaces"])); }
  catch { /* no wireless adapter */ }

  const ssid = wifiField(iface, "SSID");
  const connected = ssid ? {
    ssid,
    signal: wifiField(iface, "Signal"),
    radio: wifiField(iface, "Radio type"),
    channel: wifiField(iface, "Channel"),
    rx: wifiField(iface, "Receive rate (Mbps)"),
    tx: wifiField(iface, "Transmit rate (Mbps)"),
  } : null;

  let netsRaw = "";
  try { ({ stdout: netsRaw } = await execFileAsync("netsh", ["wlan", "show", "networks", "mode=bssid"])); }
  catch { /* ignore */ }

  const networks = [];
  let curSsid = "", curAuth = "";
  for (const raw of netsRaw.split("\n")) {
    const t = raw.trim();
    if (t.startsWith("SSID ")) {
      const idx = t.indexOf(":");
      if (idx !== -1) curSsid = t.slice(idx + 1).trim();
    } else {
      const idx = t.indexOf(":");
      if (idx === -1) continue;
      const key = t.slice(0, idx).trim();
      const val = t.slice(idx + 1).trim();
      if (key.toLowerCase() === "authentication") curAuth = val;
      else if (key.toLowerCase() === "signal" && curSsid) networks.push({ ssid: curSsid, signal: val, auth: curAuth });
    }
  }

  return { connected, networks, supported: true };
}

module.exports = { telemetry, system_snapshot, net_info, wifi_info };
