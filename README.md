# NexusOS

NexusOS is a Windows desktop "command center" app. It puts live system stats, network tools, a terminal, security utilities (hashing, password lab, JWT decoder, entropy, EXIF metadata reader/stripper), voice notes and a file index in one window. It also has an AI assistant (chat and voice) that can use tools on the machine, and an Agent Mode that plans and runs multi-step jobs on its own. All AI runs locally on the Qwen 3.5 9B model through Ollama; there is no cloud model and no AI API key.

Built by Gio ([Built-By-Gio](https://github.com/Built-By-Gio)).

## Status (2026-11-25)

Working, as recorded in the project's own test notes:

- 2026-10-15: `npm start` built and opened the full dashboard with live CPU, memory, network and weather; `npm run dev` connected Vite hot reload.
- 2026-10-15: local AI tested on one PC with an 8 GB NVIDIA GPU: about 28 tokens/s, about 18 s model load, tool calls work, image input works, and Agent Mode finished a two-step job.
- 2026-10-16: dashboard telemetry no longer starts a new process every tick (measured 9 process spawns per 10 s before, 0 after), which removed a constantly spinning busy cursor.
- 2026-11-25: `npm run build` (Vite production build) of this exact commit completes without errors.

Not tested / known problems:

- There are no automated tests. Everything above was checked by hand on one Windows PC.
- Wake word and push-to-talk voice input do not work under Electron (browser speech recognition is not available there). A local speech-to-text engine is the likely fix.
- The window icon file (`build/icon.ico`) is not included, so the app uses the default icon.
- Gateway latency stays on "Measuring" on networks whose router ignores ping.
- Ollama's CUDA 13 backend crashed on about 1 in 5 cold model loads on the test PC; the app forces the CUDA 12 backend when an NVIDIA card is present and retries a failed load once.

Unfinished: most of the roadmap (see below). Phase 1 is half done (event bus built, agent tool schema not yet), and Phases 2 to 5 have not started.

## What you need

- Windows 10 or 11 (the app targets Windows only).
- Node.js with npm. Tested with Node 26.13.1 and npm 11.20.0. Main dependencies: Electron 33, React 19, Vite 7, anime.js 4.
- [Ollama](https://ollama.com) with the model `qwen3.5:9b` (about a 6.6 GB download). It runs well on a GPU with about 8 GB of memory and slowly on CPU only. The app can also install/start Ollama and download the model from its Local AI setup screen.
- Internet for the default voice: speech uses Microsoft's "Jenny" neural voice (`en-US-JennyNeural`) through the `msedge-tts` package. No key is needed. Without internet the app falls back to the Windows system voice.

Optional services (only used if you enter your own key in the app):

- ElevenLabs for voice (key saved in Settings, or the `ELEVENLABS_API_KEY` environment variable).
- Groq or OpenAI for transcribing imported audio in Voice Notes.

Weather comes from the free Open-Meteo API.

## How to build / run

1. Install Node.js and Ollama.
2. Download the model: `ollama pull qwen3.5:9b` (or let the app do it on first run).
3. Clone this repo and open a terminal in the folder.
4. `npm install`
5. `npm start` builds the frontend and launches the app. For development, `npm run dev` launches Electron with a Vite dev server and hot reload.

npm 11 skips install scripts unless they are allowed. `package.json` allows them for electron, esbuild and sharp; if Electron's binary still does not download, run `npm install-scripts approve electron`.

If `npm install` finishes but `node_modules\electron\dist\electron.exe` is missing, Electron's unzip step failed silently. Extract it by hand from the cached download (PowerShell, in the repo folder):

```powershell
Add-Type -A System.IO.Compression.FileSystem
$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*-win32-x64.zip" | Select -First 1
[IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, "$PWD\node_modules\electron\dist\_x")
Get-ChildItem node_modules\electron\dist\_x | Move-Item -Destination node_modules\electron\dist -Force
Set-Content node_modules\electron\path.txt "electron.exe" -NoNewline -Encoding ascii
```

## Repo layout

- `src/` - the React UI and the assistant/agent logic (`NexusCore.jsx` is most of the UI, `agentEngine.js` and `AgentMode.jsx` are Agent Mode, `circuit.css`, `decor.jsx` and `motion.js` are the look and animation)
- `electron/main.cjs` - window and IPC dispatch
- `electron/preload.cjs` - exposes `invoke` / `listen` to the page
- `electron/commands/` - the backend commands (system, network, shell, files, state, agent, ollama, voice, ...)
- `electron/watch.cjs` - long-lived helper processes for telemetry
- `public/` - audio served as-is (the tour and tutorial audio)
- `ARCHITECTURE.md`, `DECISIONS.md`, `ROADMAP.md`, `CHECKLIST.md` - design notes, the reasons behind major choices, and the plan

## Roadmap / future plans

From `ROADMAP.md` and `CHECKLIST.md`. Some items there were written for the earlier Tauri/Rust version (for example the `cpal`/`hound` recorder and `whisper-rs`) and will need to be redone for the Electron backend.

- Phase 1, Foundation: agent tool schema (the event bus is done).
- Phase 2, Recorder + Files: choose local vs API transcription, audio recorder with live waveform, mic/system source toggle, Voice Notes UI, an artifact bus that Files subscribes to, drag-and-drop, transcription.
- Phase 3, Assistant + modules: agent router, wake-word assistant connected to all modules, cross-module timeline, local semantic search, file converter.
- Phase 4, Preview + scheduling: preview mode for Agent Mode, scheduled agent runs, ambient monitoring.
- Phase 5, Deferred / high risk: Gmail integration; a debloat / file analyzer (only with stage-don't-delete, 30-day undo, mandatory preview and hard exclusions).
- Also open: remove unused dashboard grid code.

## Credits

- The audio tracks in `public/` (tutorial and tour audio: `tutorial-1.mp3`, `tutorial-2.mp3`, `about-tour.mp3`) were made by Gio.
- Fonts IBM Plex Mono, IBM Plex Sans and VT323 are bundled through the `@fontsource` npm packages (SIL Open Font License).

### Contributors

- [lunar-z11](https://github.com/lunar-z11)

## License

MIT. See [LICENSE](LICENSE).
