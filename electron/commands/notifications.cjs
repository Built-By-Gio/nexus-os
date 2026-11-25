const { Notification } = require("electron");

async function is_permission_granted() { return true; }
async function request_permission() { return "granted"; }

async function notify({ options }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: options?.title || "NexusOS", body: options?.body || "" });
  n.show();
}

module.exports = {
  "plugin:notification|is_permission_granted": is_permission_granted,
  "plugin:notification|request_permission": request_permission,
  "plugin:notification|notify": notify,
};
