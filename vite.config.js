import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://api.groq.com https://api.openai.com",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
].join("; ");

const csp = {
  name: "csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
};

export default defineConfig({
  base: "./",
  plugins: [react(), csp],
  server: { port: 1420, strictPort: true },
});
