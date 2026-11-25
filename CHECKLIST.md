# NexusOS Checklist

## End Goal
NexusOS is a Windows desktop app — one module taken to real, measurable depth, inside a working AI command center that plans and runs jobs on its own and keeps private work local and free (Ollama) with natural voice (ElevenLabs). No Linux port, no bootable image, no VM.

## Now — Unblock and Stabilize
- [x] Run `npm run tauri dev` — compiles clean, app runs (PC 1)
- [x] Commit current changes
- [x] Push repo to GitHub (private repo)
- [x] Smoke-test previously-unrun features: notifications, run history, cost tracking
- [x] Test the ask_human handoff card end to end
- [x] Test Stop while a run is paused
- [x] Confirm quick fixes: model picker persists across restart; assistant doesn't quit early / truncate

## Quick Fixes
- [x] Raise assistant tool loop from 5 to 10 (both text + voice loops)
- [x] Raise assistant reply cap above 800 tokens (text chat 1000→2000; voice stays short by design)
- [x] Persist model picker so it survives restart

## Phase 1 — Foundation
- [x] Event bus — src/eventBus.js (ready for the Phase 2 artifact bus to plug into)
- [ ] Agent tool schema (design now even though the router is Phase 3)

## Phase 2 — Recorder + Files
- [ ] Decide local whisper-rs vs API transcription
- [ ] Add cpal and hound to Cargo
- [ ] Rust recorder with streaming WAV writer, 16kHz mono
- [ ] Emit recording:level events for live waveform
- [ ] Mic / System / Both source toggle
- [ ] Voice Notes module UI
- [ ] emit_artifact command + artifact:created bus
- [ ] Files subscribes to the bus with source badges
- [ ] Drag-drop via onDragDropEvent
- [ ] Transcription

## Phase 3 — Assistant + Modules
- [ ] Agent router (uses Phase 1 tool schema)
- [ ] Wake-word assistant (~15h) connected to all modules (~75h routing layer)
- [ ] Cross-module timeline
- [ ] Local semantic search
- [ ] File converter

## Phase 4 — Preview + Scheduling
- [ ] Preview mode for Agent Mode
- [ ] Scheduled agent runs
- [ ] Ambient monitoring

## Phase 5 — Deferred / High Risk
- [ ] Gmail integration
- [ ] Debloat / file analyzer — stage-don't-delete, 30-day undo, mandatory preview, hard exclusions before any code

## Ongoing
- [x] Comment cleanup pass — no narration/emoji/debug/dead code; stripped em-dashes + smart quotes from all comments (kept in UI copy); nuked all ASCII banner blocks + divider lines (376 lines)
- [ ] Fix any placeholder dates in DECISIONS.md from the git log

## Agent Test Runs (validate the autonomous engine)
- [ ] Agent run: install Ollama
- [ ] Agent run: pull a local model
- [ ] Point the assistant at the local Ollama model

## Lightbulbs / polish (later)
- [x] Fix wrong widget values: round trip now measures real latency (pings the gateway every 6s); temp is hidden when the OS exposes no sensor instead of showing a fake 0. NOTE: reading real CPU temp on Windows needs a hardware-monitor dependency (LibreHardwareMonitor/WMI, often admin) — deferred; hiding is the honest display for now.
- [x] Jarvis-style launch animation: splash boot sequence - dot stretches to a line, opens into the HUD frame, arc-reactor orb and terminal type out, then the panel expands to fullscreen as the quote resolves
- [x] launch_app now resolves common Windows utilities by plain name ("task manager", "control panel", "device manager", etc. — SYSTEM_APPS table) instead of only Quick Launch/URL/path, so a bare voice/chat command actually launches something instead of asking for clarification. Also fixed the Electron port's launch_app to spawn via `cmd /C start` (matching the Rust version) instead of shell.openPath, since openPath doesn't PATH-search bare exe names like "taskmgr" the way `start` does.

## Open — next session (priority order)
- [x] DECIDE dashboard: keeping the fixed orbit, same-size swaps only. Already settled in DECISIONS.md (2026-08-13, three failed bento attempts) — reconfirmed 2026-09-11, not revisiting again.
- [x] Wire more modules to the assistant: Networking (scan_network_devices, get_wifi_info), Voice Notes (get/add/read), Automation (get/add/enable/remove — required lifting rules into ctx), Files-open (open_file), Projects (add/update/add-task/complete-task — required lifting projects/setProjects into ctx, same fix Voice Notes already got). All 14 new tools follow the ASSISTANT_TOOLS + runAssistantTool pattern.
- [x] Drop Voice Notes transcripts/summaries into the Files module — done by reading the shared voice-notes store (simpler + always in sync than the event bus); shows with a "Voice Notes" source badge, searchable + summarizable
- [ ] Dead-code cleanup: remove unused WidgetCell + orbit-era grid CSS
- [x] Push all local commits to GitHub
