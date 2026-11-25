const dns = require("dns");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { watch } = require("../watch.cjs");
const execFileAsync = promisify(execFile);
const lookupAsync = promisify(dns.lookup);

async function dns_lookup({ host }) {
  try {
    const results = await lookupAsync(host.trim(), { all: true });
    const out = [...new Set(results.map((r) => r.address))].sort();
    return out;
  } catch (e) {
    throw new Error(`could not resolve ${host}: ${e.message}`);
  }
}

async function ping_host({ host }) {
  const clean = host.trim();
  const args = process.platform === "win32"
    ? ["-n", "1", "-w", "2000", clean]
    : ["-c", "1", "-W", "2", clean];
  let stdout;
  try { ({ stdout } = await execFileAsync("ping", args)); }
  catch (e) { throw new Error(`ping failed: ${e.message}`); }

  const m = stdout.match(/time[=<]\s*([\d.]+)/i);
  if (m) return parseFloat(m[1]);
  throw new Error("no reply");
}

let pinger = null;

async function latency({ host }) {
  const clean = host.trim();
  if (pinger?.host !== clean) {
    pinger?.w.stop();
    const p = { host: clean, ms: null };
    const args = process.platform === "win32" ? ["-t", "-w", "2000", clean] : [clean];
    p.w = watch("ping", args, (line) => {
      const m = line.match(/time[=<]\s*([\d.]+)/i);
      if (m) p.ms = parseFloat(m[1]);
    });
    pinger = p;
  }
  return pinger.ms;
}

async function traceroute({ host }) {
  const clean = host.trim();
  if (!clean) throw new Error("No host given.");
  const [cmd, args] = process.platform === "win32"
    ? ["tracert", ["-d", "-h", "15", clean]]
    : ["traceroute", ["-n", "-m", "15", clean]];
  let stdout;
  try { ({ stdout } = await execFileAsync(cmd, args, { timeout: 20000 })); }
  catch (e) {
    stdout = e.stdout || "";
    if (!stdout) throw new Error(`traceroute failed: ${e.message}`);
  }
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("No output.");
  return lines;
}

const VENDOR_TABLE = {
  "00:1a:11": "Google", "3c:5a:b4": "Google", "f4:f5:e8": "Google", "a4:77:33": "Google", "d8:6c:63": "Google",
  "f0:18:98": "Apple", "a4:83:e7": "Apple", "ac:bc:32": "Apple", "3c:15:c2": "Apple", "f0:99:bf": "Apple", "88:66:5a": "Apple",
  "dc:a6:32": "Raspberry Pi", "b8:27:eb": "Raspberry Pi", "e4:5f:01": "Raspberry Pi",
  "5c:cf:7f": "Espressif", "a0:20:a6": "Espressif", "24:0a:c4": "Espressif", "dc:4f:22": "Espressif", "cc:50:e3": "Espressif",
  "00:1d:0f": "Netgear", "c0:35:32": "Netgear", "20:e5:2a": "Netgear", "a0:63:91": "Netgear", "10:da:43": "Netgear",
  "00:14:22": "Dell", "b0:4e:26": "Dell", "c8:d7:19": "Dell",
  "00:50:56": "VMware", "00:0c:29": "VMware", "00:05:69": "VMware",
  "ec:0d:e4": "Samsung", "f4:64:12": "Samsung", "82:ed:2f": "Samsung",
  "00:17:88": "Philips Hue", "d0:73:d5": "Philips Hue",
  "18:b4:30": "Nest", "64:16:66": "Nest",
  "00:1b:63": "Cisco", "00:23:76": "Cisco",
};

function vendorFor(mac) {
  const p = mac.toLowerCase().replace(/-/g, ":");
  const prefix = p.split(":").slice(0, 3).join(":");
  if (VENDOR_TABLE[prefix]) return VENDOR_TABLE[prefix];
  if (prefix.startsWith("01:00:5e")) return "IPv4 multicast";
  if (prefix.startsWith("ff:ff:ff")) return "Broadcast";
  if (prefix.startsWith("33:33")) return "IPv6 multicast";
  return "";
}

const IP_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;
const MAC_RE = /\b([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/;

async function arp_table() {
  let stdout;
  try { ({ stdout } = await execFileAsync("arp", ["-a"])); }
  catch (e) { throw new Error(`arp failed: ${e.message}`); }

  const devices = [];
  for (const line of stdout.split("\n")) {
    const ipMatch = line.match(IP_RE);
    const macMatch = line.match(MAC_RE);
    if (ipMatch && macMatch) {
      const mac = macMatch[0].replace(/-/g, ":").toLowerCase();
      devices.push({ ip: ipMatch[1], mac, vendor: vendorFor(mac), host: "" });
    }
  }
  return devices;
}

async function resolve_hostname({ ip }) {
  const clean = (ip || "").trim();
  if (!clean) return "";

  if (process.platform === "win32") {
    let stdout;
    try { ({ stdout } = await execFileAsync("nbtstat", ["-A", clean])); }
    catch (e) { throw new Error(`nbtstat failed: ${e.message}`); }
    for (const line of stdout.split("\n")) {
      if (line.includes("<00>") && line.toUpperCase().includes("UNIQUE")) {
        const name = line.trim().split(/\s+/)[0];
        if (name && name !== "MAC") return name;
      }
    }
    return "";
  }
  try {
    const { stdout } = await execFileAsync("getent", ["hosts", clean]);
    const parts = stdout.trim().split(/\s+/);
    return parts[1] || "";
  } catch { return ""; }
}

module.exports = { dns_lookup, ping_host, latency, traceroute, arp_table, resolve_hostname };
