# Architecture

## Shape
Electron app. Two halves:

- **Node backend** (`electron/`) — everything that touches the OS. `main.cjs` creates the window and dispatches `nx:invoke` IPC calls to `electron/commands/*.cjs`. `preload.cjs` exposes `window.__TAURI__.core.invoke` / `event.listen` (the name is kept from the Tauri days so the frontend didn't need changes).
- **React frontend** (`src/`) — the UI and all assistant/agent logic, talking to the backend over those commands. All inference goes through the backend's call_model, which talks to a local Ollama.

Run: `npm start` (build + launch) or `npm run dev` (Vite dev server started inside the Electron main process, hot reload).

## Node backend (`electron/commands/`)

- **system.cjs** — `telemetry`, `system_snapshot`, `net_info`, `wifi_info` (via `systeminformation` and `netsh`).
- **network.cjs** — `dns_lookup`, `ping_host`, `traceroute`, `arp_table`, `resolve_hostname`.
- **shell.cjs** — `run_shell`.
- **files.cjs** — `read_metadata`, `strip_metadata` (+ `_bytes` variants) via `exifr` and `sharp`; `index_folder`, `find_folders`.
- **ollama.cjs** — `call_model` translates the app's Messages-API-shaped request to Ollama `/api/chat` (`qwen3.5:9b`, text, images, tools) and translates the reply back, so no caller had to change. Also `ollama_status`, `ollama_start`, `ollama_pull` (progress on the `ollama:pull` event).
- **remote.cjs** — `edge_tts` / `edge_warm` (Microsoft neural voices via `msedge-tts`, one reused connection), `eleven_tts` (ElevenLabs, optional key), `get_weather` (Open-Meteo).
- **state.cjs** — `load_state`, `save_state`, `factory_reset`, ElevenLabs key storage in the Electron userData folder.
- **launch.cjs** — `launch_app` (`cmd /C start`), `git_info`.
- **notifications.cjs** — the `plugin:notification|*` calls, via Electron's `Notification`.

### `agent.cjs`
Agent execution primitives — the command-running side of Agent Mode. Commands run as child processes with output streamed to the window as `agent:output` events. Command timeout is **idle-based**: a command is killed after ~120s of silence (no stdout/stderr), with a hard 3600s ceiling behind it. Readers break on `\r` as well as `\n` so progress bars (which redraw without newlines) aren't mistaken for a hang. The engine is told *how* a command died — `stalled` (retrying is pointless, find the non-interactive flag) vs `over_time` (genuinely slow, raise the ceiling).

## React frontend

### `NexusCore.jsx` (~12.7k lines)
The whole UI and most logic. Modules: Dashboard, System, Network, Terminal, Security, Metadata, Weather, Voice Notes, Files, Cyber Twin, Assistant, Agent Mode, Settings.

- `askAI({ system, messages, tools, maxTokens })` — single inference entry point used by chat, voice and the module helpers; always the local model.
- `ASSISTANT_TOOLS` — the tool set the conversational assistant can call.
- Voice: `ELEVEN_VOICES` (stock British voice IDs), a single reused `Audio` element, and a **speech queue** so greetings/warnings/answers don't play over each other (answers to direct questions jump the queue; splash and tour hold it).
- One model only (`agentEngine.DEFAULTS.model` / `MODEL_LABEL`); there is no picker or cost meter.

### `agentEngine.js` (~930 lines)
The Agent Mode brain. Planning loop, tool dispatch, run budget, cost estimation (`estimateCost`, `DEFAULTS`), and the human-handoff (`ask_human`) pause/resume state, which lives in the engine singleton so it survives leaving and re-entering Agent Mode. `call_model` uses `max_tokens: 4000` here.

### `agentNotify.js` (~180 lines)
Desktop notifications for agent run events (via Electron's `Notification`).

### Look and motion
- `circuit.css` — the "sentient machine" style layer (program-window panels, terminal nav, splash), loaded after the base `CSS` string in NexusCore and before the per-theme tokens. Themes add `--trace` (PCB line color) and, for Bone, `--signal-ink` (darker accent for green text on light paper).
- `decor.jsx` — procedural SVG art: `Traces` (seeded PCB routing), `Dither` (Bayer 1-bit shapes), `NeuralNet`, silkscreen labels, `TerminalTag`, the per-module `Collage` backdrop, and the status-line `Ticker` (scrolls with a CSS animation, no JS per frame).
- `motion.js` — anime.js helpers: `enterView` (window-open panels, title decode, scroll reveal), `wipe` (dither dissolve), `sparkOnClick` (pixel scatter). Everything checks `calm()` (motion setting off or OS reduced motion). Continuous animations are stepped to keep idle repaints low.

### `AgentMode.jsx` (~800 lines)
Agent Mode UI — run view, status line, log rows, the handoff card.

## Direction (see ROADMAP.md)
Phase 1 introduces an **event bus** and a formal **agent tool schema**. NexusOS targets Windows only — no Linux port, no bootable image.
