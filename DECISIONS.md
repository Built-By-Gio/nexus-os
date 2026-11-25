# Decisions

Why things are the way they are. Newest first. Each entry: the call, the reason, and what it rules out.

## 2026-10-15 (cont.) — AI is local only: Qwen 3.5 9B on Ollama; cloud model and Encyclopedia removed
Gio wants Nexus to cost nothing to run, so every AI feature runs on `qwen3.5:9b` through Ollama
on the user's own machine. The cloud model is gone completely: no key, no fallback, no model picker, no cost
meter. The app still builds Messages-API-shaped requests; `electron/commands/ollama.cjs`
translates them, so the assistant tool loop, Agent Mode, homework photo help (Qwen 3.5 reads images)
and the other helpers didn't change. The Encyclopedia was removed because it depended on the cloud model's
server-side web search. Trade-offs: a 9B model is weaker at long multi-step jobs (Agent Mode now
caps at 40 turns, guard stays on), and every machine needs Ollama plus a 6.6 GB download. It runs
well on a GPU with about 8 GB, and slowly on CPU only. Rules out: paid cloud models, API keys for AI.

## 2026-10-15 (cont.) — Look is the "sentient machine" collage, not the brutalist poster
Gio tried the Option B brutalist redesign and said it felt too out there and not like Nexus. He
gave a reference collage instead: circuit boards, 1-bit dither, retro program windows, phosphor
terminal text, a neural-net diagram. That reference is the design source now, not design-system
options A/B/C. Dark-first (Circuit default), one light theme (Bone). All art is procedural SVG; no
photos copied from the reference. Rules out: the poster/burst/sparkle look, glass, rounded cards.

## 2026-10-15 (cont.) — Default voice is Microsoft Jenny, no key
Supersedes "ElevenLabs stays for voice" below. Natural speech now uses Microsoft's neural voices
(`en-US-JennyNeural`, `en-US-GuyNeural` for male) through the same online service Edge Read Aloud uses,
via `msedge-tts`. No account or key. Trade-offs: it's an unofficial endpoint that Microsoft could
change, it needs internet, and spoken text goes to Microsoft. It also refuses most new connections
(429), so the app keeps one connection open from startup. ElevenLabs is still used if a key is saved;
the system voice is the offline fallback.

## 2026-10-15 — Electron is the only backend; Tauri removed
Supersedes the entry below. Keeping two copies in sync by hand wasn't worth it, and the second PC can't
build Tauri at all. `electron/` from `..\nexus-electron\` was merged into this project and
`src-tauri/` was removed (the Rust source is still in `nexus-os-master (1).zip` and on GitHub). The
preload still exposes the `window.__TAURI__` shape, so the frontend didn't need changes. Rules out:
any Rust/MSVC toolchain requirement.

## 2026-09-11 (cont.) — Electron port lives in a separate sibling project, not a rewrite of this one
The second laptop can't get MSVC Build Tools approved, so `npm run tauri dev` can't work there even
though Node/npm already does. Built a parallel Electron version at
`..\nexus-electron\` (sibling of this folder) instead of rewriting this Tauri app: a preload script
reproduces the exact `window.__TAURI_INTERNALS__` / `window.__TAURI__.core.invoke` /
`window.__TAURI__.event.listen` surface the React frontend already calls, so `src/*.jsx`/`*.js` was
copied over completely unchanged — all porting work is new Electron-side code implementing the same
~48 commands `main.rs`/`agent.rs` do. This Tauri project stays the source of truth and keeps working
unmodified on the other PC; the Electron folder is regenerated from a copy of this `src/`, not the
other way around, so **future frontend changes made here need to be re-copied into `nexus-electron/src`
by hand** (no build link between the two) until/unless that becomes annoying enough to automate.

## 2026-09-11 — NexusOS stays a Windows desktop app; no Linux port, no bootable OS, no VM
Dropping the bootable-Linux-drive end goal entirely. NexusOS is a Windows desktop app, full stop. Rules out: Phase 0 (VM + toolchain, Linux build), the platform-abstraction-layer work in `src-tauri/src/platform.rs` insofar as it existed to enable a Linux port, the Windows→Linux port audit in ARCHITECTURE.md, Phase 5's ISO/kiosk/hardware work, and the Ubuntu VM boot troubleshooting on the checklist. Supersedes the 2026-08-10 "Linux base for the bootable drive" and 2026-08-11 "Five-phase roadmap, foundation first" entries below. See ROADMAP.md, CHECKLIST.md, ARCHITECTURE.md for the updated scope.

## 2026-08-13 — Dashboard is the fixed orbit, permanently (no grid/bento)
The dashboard uses the fixed orbit layout (named grid-areas: a-l + core), full stop. We tried three times to replace it with a resizable/reflowing tile grid so widgets could keep their size and move freely; every grid attempt left ugly gaps, because the widgets don't tile perfectly and a flow grid can't reproduce the hand-built symmetric orbit. The orbit's look (one solid rectangle, core centered, no gaps) is only achievable with fixed placement, which is fundamentally incompatible with "move any widget any size anywhere and reflow." We choose the look. Rearrange = pointer-drag a widget's bar, drop anywhere; it moves to the nearest SAME-SIZE widget's position and the widgets between them shift over to fill (an insert/reflow within the size tier, not a swap). Sizes never change; the orbit stays completely full (no holes); the core, having no same-size peer, stays centered. This is settled — do not revisit the grid/bento idea. Layout key: layout-v7.

## 2026-08-11 — Ollama only for the local model, no Hermes
Local inference goes through Ollama and nothing else. Hermes is dropped from the stack — it added a second moving part and a 64k-context requirement without earning its place. Rules out the Hermes desktop app and its agent layer; the local model is Ollama, called directly.

## 2026-08-11 — ElevenLabs stays for voice (SUPERSEDED 2026-10-15 — see top)
Natural speech continues to use ElevenLabs (`eleven_tts`), with the system voice as the no-key fallback. Not replacing it.

## 2026-08-11 — This repo is Nexus only
The `nexus-os` folder holds NexusOS and nothing else. The homelab/pentesting tools and other projects live elsewhere. Keeps the roadmap and checklist focused.

## 2026-08-11 — Five-phase roadmap, foundation first (SUPERSEDED 2026-09-11 — see top)
Phase 1 is foundation-only: platform abstraction, event bus, agent tool schema. Gmail and debloat deferred to Phase 6. The agent tool schema is designed in Phase 1 even though the router is Phase 3, so later modules build against a stable contract. See ROADMAP.md.

## 2026-08-11 — LAN companion over a native mobile build
Phone support comes from a LAN companion, not a native mobile app. Avoids a whole second build target and app-store overhead for what is really "reach the desktop from my phone on the same network."

## 2026-08-11 — Keep code comments, don't strip them
The cleanup pass removes narration comments, emoji, banner dividers, and dead code — but keeps why-comments, workaround notes, doc comments, and TODOs. Reason: the platform layer, event bus, agent router, and vector index will produce cross-system bugs later, and the why-comments are what make those debuggable.

## 2026-08-10 — Linux base for the bootable drive (SUPERSEDED 2026-09-11 — see top)
The bootable NexusOS image is built on Linux, not Windows. Windows To Go is dead (deprecated in 10 1903, removed in 11), so the Windows path was ruled out before any time went into it. The Linux port is therefore the gate for the entire downstream roadmap (ISO, kiosk, hardware).

## 2026-08-10 — ISO is Phase 5, not Phase 1 (SUPERSEDED 2026-09-11 — no ISO at all now)
A live image's root is read-only squashfs, so editing code through the live drive means rebuilding the squashfs per change. The ISO is a build artifact, not a dev environment — so it comes late, after the binary already runs on Linux.

## Earlier (from build bb8a03e, 2026-08-04) — engineering calls already in the code
- Command timeout is idle-based (kill on ~120s of silence, 3600s hard ceiling), not total-elapsed — a downloading 18GB model is healthy while it prints progress; a process hung on a y/N prompt prints nothing.
- Readers break on `\r` as well as `\n` so progress-bar redraws aren't read as silence.
- Agent commands run `#[tauri::command(async)]` on a worker thread; a plain command blocked the UI thread and froze the window / killed Stop.
- Agent plans are sized to the job (most goals 2–6 steps) with a runtime backstop that rejects a plan over 15 steps once.
- `ask_human` handoff state lives in the engine singleton, so it survives leaving and re-entering Agent Mode; paused time doesn't count against the run budget.
