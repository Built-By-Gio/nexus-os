const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { stopAll } = require("./watch.cjs");

const system = require("./commands/system.cjs");
const network = require("./commands/network.cjs");
const shellCmds = require("./commands/shell.cjs");
const files = require("./commands/files.cjs");
const state = require("./commands/state.cjs");
const remote = require("./commands/remote.cjs");
const launch = require("./commands/launch.cjs");
const agent = require("./commands/agent.cjs");
const notifications = require("./commands/notifications.cjs");
const ollama = require("./commands/ollama.cjs");

const commands = {
  call_model: ollama.call_model,
  ollama_status: ollama.ollama_status,
  ollama_start: ollama.ollama_start,
  ollama_pull: ollama.ollama_pull,
  ...system, ...network,
  run_shell: shellCmds.run_shell,
  ...files, ...state, ...remote, ...launch,
  agent_exec: agent.agent_exec,
  agent_stop: agent.agent_stop,
  agent_reset: agent.agent_reset,
  agent_set_guard: agent.agent_set_guard,
  agent_guard_enabled: agent.agent_guard_enabled,
  agent_write_file: agent.agent_write_file,
  agent_read_file: agent.agent_read_file,
  agent_journal_append: agent.agent_journal_append,
  agent_journal_read: agent.agent_journal_read,
  agent_journal_list: agent.agent_journal_list,
  agent_journal_clear: agent.agent_journal_clear,
  agent_probe_env: agent.agent_probe_env,
  ...notifications,
};

function toSnakeKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);
    out[snake] = v;
  }
  return out;
}

ipcMain.handle("nx:invoke", async (_event, cmd, rawArgs) => {
  const handler = commands[cmd];
  if (!handler) throw new Error(`Unknown action: ${cmd}.`);
  const args = toSnakeKeys(rawArgs || {});
  return handler(args);
});

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    frame: false,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  agent.setWindow(win);
  ollama.setWindow(win);

  win.webContents.on("console-message", (_e, _level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error(`[renderer] did-fail-load ${code}: ${desc}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[renderer] gone: ${JSON.stringify(details)}`);
  });

  if (process.argv.includes("--dev")) {
    import("vite")
      .then(({ createServer }) => createServer({ root: path.join(__dirname, "..") }))
      .then((server) => server.listen())
      .then((server) => win.loadURL(server.resolvedUrls.local[0]));
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.once("ready-to-show", () => {
    win.maximize();
    setTimeout(() => {
      win.show();
      win.focus();
    }, 1200);
  });
}

app.whenReady().then(() => {
  createWindow();
  remote.edge_warm();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", stopAll);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
