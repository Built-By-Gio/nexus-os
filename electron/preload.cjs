const { contextBridge, ipcRenderer } = require("electron");

function invoke(cmd, args) {
  return ipcRenderer.invoke("nx:invoke", cmd, args || {});
}

function listen(eventName, cb) {
  const handler = (_evt, payload) => cb({ payload });
  ipcRenderer.on(eventName, handler);
  return Promise.resolve(() => ipcRenderer.removeListener(eventName, handler));
}

contextBridge.exposeInMainWorld("__TAURI_INTERNALS__", true);
contextBridge.exposeInMainWorld("__TAURI__", {
  core: { invoke },
  event: { listen },
  invoke,
});
