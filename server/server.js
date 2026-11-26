// Radar de Sinais — servidor na nuvem.
// Roda os dois robôs 24 horas, serve o app (PWA) e envia notificações push (sinal, WIN, LOSS e gale).
// Requisitos: Node 18 ou mais novo. Única dependência: web-push.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const { spawn } = require("child_process");
require("./core.js");
const Core = globalThis.RadarCore;

const PORT = process.env.PORT || 3000;
const APP_PIN = (process.env.APP_PIN || "").trim();
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "state.json");
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const PUBLIC = path.join(__dirname, "public");
const STORE_KEY = "radar-sinais-state";

/* ---------- Persistência: arquivo local + Upstash Redis (opcional, gratuito) ---------- */
async function loadState() {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const r = await fetch(UPSTASH_URL + "/get/" + STORE_KEY, { headers: { Authorization: "Bearer " + UPSTASH_TOKEN } });
      const j = await r.json();
      if (j && j.result) { console.log("[estado] carregado do Upstash"); return JSON.parse(j.result); }
    } catch (e) { console.warn("[estado] Upstash indisponível:", e.message); }
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { return {}; }
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const st = Object.assign(engine.persist(), { subs: [...subs.values()], vapid });
    const txt = JSON.stringify(st);
    try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, txt); } catch (e) {}
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try { await fetch(UPSTASH_URL + "/set/" + STORE_KEY, { method: "POST", headers: { Authorization: "Bearer " + UPSTASH_TOKEN }, body: txt }); }
      catch (e) { console.warn("[estado] falha ao salvar no Upstash:", e.message); }
    }
  }, 1500);
}

/* ---------- Notificações push ---------- */
let vapid = null;
const subs = new Map(); // endpoint -> subscription
const PUSH_KINDS = ["signal", "win", "loss", "gale"];
function pushTitle(ev) {
  const r = ev.robot != null ? engine.cfg.robots[ev.robot] : null;
  const head = ev.kind === "win" ? "WIN 🤑" : ev.kind === "loss" ? "LOSS 😢" : ev.kind === "gale" ? "GALE 🔁" : "Sinal: " + (ev.dir === "buy" ? "COMPRA" : "VENDA");
  return head + (r ? " · " + r.name : "");
}
async function sendPush(payload) {
  const body = JSON.stringify(payload);
  await Promise.all([...subs.values()].map(async (s) => {
    try { await webpush.sendNotification(s, body, { TTL: 120, urgency: "high" }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { subs.delete(s.endpoint); saveState(); } else console.warn("[push]", e.statusCode || e.message); }
  }));
}

/* ---------- Ponte da IQ Option (Python, só leitura, escuta em 127.0.0.1) ---------- */
const IQ_ON = !!(process.env.IQ_EMAIL && process.env.IQ_PASSWORD) || process.env.IQ_FAKE === "1";
const IQ_PORT = process.env.IQ_BRIDGE_PORT || "8765";
let bridgeTimer = null;
function startBridge() {
  bridgeTimer = null;
  const ch = spawn(process.env.PYTHON || "python3", [path.join(__dirname, "iq_bridge.py")], { env: Object.assign({}, process.env, { IQ_BRIDGE_PORT: IQ_PORT, PYTHONUNBUFFERED: "1" }), stdio: ["ignore", "inherit", "inherit"] });
  const again = (why) => { if (bridgeTimer) return; console.warn("[iq] ponte parou (" + why + "), reiniciando em 15 s"); bridgeTimer = setTimeout(startBridge, 15000); };
  ch.on("exit", (c) => again("código " + c));
  ch.on("error", (e) => again(e.message));
}

/* ---------- Motor ---------- */
let engine;
async function boot() {
  const st = await loadState();
  vapid = (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : (st.vapid && st.vapid.publicKey ? st.vapid : webpush.generateVAPIDKeys());
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:radar@example.com", vapid.publicKey, vapid.privateKey);
  (st.subs || []).forEach((s) => s && s.endpoint && subs.set(s.endpoint, s));
  if (IQ_ON) startBridge();
  const cfg = st.cfg || {};
  if (process.env.TWELVE_DATA_KEY && !cfg.apiKey) cfg.apiKey = process.env.TWELVE_DATA_KEY;
  engine = Core.createEngine({
    cfg, hist: st.hist, log: st.log, running: st.running,
    iq: IQ_ON ? { base: "http://127.0.0.1:" + IQ_PORT } : null,
    mt: { key: process.env.API2TRADE_API_KEY, account: process.env.API2TRADE_ACCOUNT_ID, base: process.env.API2TRADE_BASE_URL },
    onEvent: (ev) => {
      console.log("[evento]", ev.kind, ev.text || "");
      if (PUSH_KINDS.includes(ev.kind)) sendPush({ title: pushTitle(ev), body: ev.text, tag: "radar-" + ev.id, url: "./#agente" });
      saveState();
    },
    onChange: () => {},
  });
  await engine.init();
  setInterval(() => { try { engine.tick(); } catch (e) { console.error(e); } }, 500);
  setInterval(saveState, 60000);
  server.listen(PORT, () => console.log("Radar de Sinais rodando na porta " + PORT + (APP_PIN ? " (PIN ativo)" : " (sem PIN: configure APP_PIN)")));
}

/* ---------- HTTP ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function send(res, code, obj) { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); }
function pinOk(req) {
  if (!APP_PIN) return true;
  const got = String(req.headers["x-radar-pin"] || "");
  const a = Buffer.from(got), b = Buffer.from(APP_PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readBody(req) {
  return new Promise((ok, bad) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 2e6) req.destroy(); }); req.on("end", () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/ping") return send(res, 200, { radar: true, version: 7, mt: !!(engine && engine.hasMT()), iq: !!(engine && engine.hasIQ()), vapidPublicKey: vapid.publicKey, pinRequired: !!APP_PIN, time: Date.now() });
    if (p.startsWith("/api/")) {
      if (!pinOk(req)) return send(res, 401, { error: "PIN inválido" });
      if (p === "/api/state" && req.method === "GET") return send(res, 200, engine.snapshot({ c: [{ sym: url.searchParams.get("s1") }, { sym: url.searchParams.get("s2") }] }));
      if (req.method !== "POST") return send(res, 405, { error: "Método não permitido" });
      const body = await readBody(req);
      if (p === "/api/robot") { const i = +body.i; if (body.action === "start") engine.start(i); else engine.stop(i); saveState(); return send(res, 200, { ok: true }); }
      if (p === "/api/config") { await engine.setConfig(body.cfg, !!body.keepKey); saveState(); return send(res, 200, { ok: true }); }
      if (p === "/api/clear") { engine.clearHistory(); saveState(); return send(res, 200, { ok: true }); }
      if (p === "/api/subscribe") { const s = body.subscription; if (!s || !s.endpoint) return send(res, 400, { error: "inscrição inválida" }); subs.set(s.endpoint, s); saveState(); return send(res, 200, { ok: true, total: subs.size }); }
      if (p === "/api/unsubscribe") { if (body.endpoint) subs.delete(body.endpoint); saveState(); return send(res, 200, { ok: true }); }
      if (p === "/api/test-push") { await sendPush({ title: "Radar de Sinais", body: "Notificação de teste: está tudo funcionando.", tag: "radar-teste", url: "./#informacoes" }); return send(res, 200, { ok: true, total: subs.size }); }
      return send(res, 404, { error: "Rota não encontrada" });
    }
    // Arquivos do app
    let file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": ext === ".html" || file.endsWith("sw.js") ? "no-cache" : "public, max-age=3600" });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
});

process.on("SIGTERM", () => { clearTimeout(saveTimer); try { fs.writeFileSync(DATA_FILE, JSON.stringify(Object.assign(engine.persist(), { subs: [...subs.values()], vapid }))); } catch (e) {} process.exit(0); });
boot();
