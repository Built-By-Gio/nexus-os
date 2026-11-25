const { readElevenKey } = require("./state.cjs");

async function eleven_tts({ text, voice_id }) {
  const key = readElevenKey();
  if (!key) throw new Error("NO_ELEVEN_KEY");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    const msg = buf.toString("utf8").slice(0, 160);
    throw new Error(`voice error ${res.status}: ${msg}`);
  }
  return Array.from(buf);
}

// Most new connections get a 429, but an open one keeps working, so keep one.
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let edge = null;

function edgeConnect(voice, tries) {
  if (edge?.voice === voice) return edge.ready;
  edge?.tts.close();
  const tts = new MsEdgeTTS();
  const ready = (async () => {
    for (let i = 1; ; i++) {
      try { await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3); return tts; }
      catch (e) { if (i >= tries) throw e; await sleep(Math.min(400 * i, 2000)); }
    }
  })();
  edge = { tts, voice, ready };
  ready.catch(() => { if (edge?.tts === tts) edge = null; });
  return ready;
}

function edgeSay(tts, text) {
  return new Promise((resolve, reject) => {
    const { audioStream } = tts.toStream(text);
    const chunks = [];
    const timer = setTimeout(() => reject(new Error("voice timed out")), 15000);
    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", () => { clearTimeout(timer); chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error("no audio")); });
    audioStream.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function edge_tts({ text, voice = "en-US-JennyNeural" }) {
  try {
    return Array.from(await edgeSay(await edgeConnect(voice, 4), text));
  } catch {
    edge?.tts.close();
    edge = null;
    return Array.from(await edgeSay(await edgeConnect(voice, 3), text));
  }
}

function edge_warm({ voice = "en-US-JennyNeural" } = {}) {
  edgeConnect(voice, 20).catch(() => {});
  return true;
}

const WMO_LABELS = {
  0: "Clear", 1: "Partly cloudy", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Rain", 63: "Rain", 65: "Rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Snow", 73: "Snow", 75: "Snow", 77: "Snow",
  80: "Showers", 81: "Showers", 82: "Showers",
  85: "Snow showers", 86: "Snow showers",
  95: "Thunderstorm", 96: "Hailstorm", 99: "Hailstorm",
};

async function get_weather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather request failed: ${res.status}`);
  const json = await res.json();

  const temp = json?.current?.temperature_2m;
  if (temp == null) throw new Error("no temperature");
  const code = json?.current?.weather_code ?? -1;
  const high = json?.daily?.temperature_2m_max?.[0] ?? temp;
  const low = json?.daily?.temperature_2m_min?.[0] ?? temp;

  return {
    temp_f: Math.round(temp),
    label: WMO_LABELS[code] || "—",
    high: Math.round(high),
    low: Math.round(low),
  };
}

module.exports = { eleven_tts, edge_tts, edge_warm, get_weather };
