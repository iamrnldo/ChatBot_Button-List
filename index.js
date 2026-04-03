// ==========================================
//  INDEX.JS - Backend
//  Koneksi WhatsApp, Auth, HTTP Keep-Alive
// ==========================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
} = require("atexovi-baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const http = require("http"); // built-in, tanpa install tambahan

// Import handler
const { handleMessage } = require("./handler");

// ==========================================
// KONFIGURASI
// ==========================================
const logger = pino({ level: "silent" });
const PORT = process.env.PORT || 8080;

const store = makeInMemoryStore({ logger });
store?.readFromFile("./store.json");
setInterval(() => {
  store?.writeToFile("./store.json");
}, 10_000);

// ==========================================
// VARIABEL STATUS BOT (untuk endpoint /ping)
// ==========================================
let botStatus = {
  connected: false,
  startTime: new Date(),
  lastPing: null,
  pingCount: 0,
  messageCount: 0,
};

// ==========================================
// HTTP SERVER (ANTI-IDLE KOYEB)
// ==========================================
const server = http.createServer((req, res) => {
  const url = req.url;
  const now = new Date();

  // ====== ROUTE: /ping ======
  if (url === "/ping" || url === "/") {
    botStatus.lastPing = now;
    botStatus.pingCount++;

    const uptime = getUptime(botStatus.startTime);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "alive",
        bot: botStatus.connected ? "connected" : "disconnected",
        uptime: uptime,
        pingCount: botStatus.pingCount,
        messageCount: botStatus.messageCount,
        lastPing: now.toISOString(),
        timestamp: now.toISOString(),
      }),
    );

    console.log(`🏓 Ping #${botStatus.pingCount} received | Uptime: ${uptime}`);
    return;
  }

  // ====== ROUTE: /health ======
  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        bot: botStatus.connected ? "online" : "offline",
        uptime: getUptime(botStatus.startTime),
      }),
    );
    return;
  }

  // ====== ROUTE: /status ======
  if (url === "/status") {
    const uptime = getUptime(botStatus.startTime);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WA Bot Status</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: #0a0a0a;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
          }
          .card {
            background: #1a1a2e;
            border-radius: 16px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 0 30px rgba(0,255,136,0.1);
          }
          h1 { color: #00ff88; margin-top: 0; }
          .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
          }
          .online { background: #00ff8830; color: #00ff88; }
          .offline { background: #ff444430; color: #ff4444; }
          .info { margin: 20px 0; }
          .info div {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #333;
          }
          .label { color: #888; }
          .value { color: #fff; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🤖 WA Bot</h1>
          <span class="status ${botStatus.connected ? "online" : "offline"}">
            ${botStatus.connected ? "🟢 ONLINE" : "🔴 OFFLINE"}
          </span>
          <div class="info">
            <div>
              <span class="label">Uptime</span>
              <span class="value">${uptime}</span>
            </div>
            <div>
              <span class="label">Ping Count</span>
              <span class="value">${botStatus.pingCount}</span>
            </div>
            <div>
              <span class="label">Messages</span>
              <span class="value">${botStatus.messageCount}</span>
            </div>
            <div>
              <span class="label">Last Ping</span>
              <span class="value">${botStatus.lastPing ? botStatus.lastPing.toLocaleString("id-ID") : "Never"}</span>
            </div>
            <div>
              <span class="label">Started</span>
              <span class="value">${botStatus.startTime.toLocaleString("id-ID")}</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // ====== ROUTE: 404 ======
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Jalankan HTTP Server
server.listen(PORT, () => {
  console.log(`🌐 HTTP Server running on port ${PORT}`);
  console.log(`   📍 Ping endpoint: http://localhost:${PORT}/ping`);
  console.log(`   📍 Status page:   http://localhost:${PORT}/status`);
  console.log(`   📍 Health check:  http://localhost:${PORT}/health`);
  console.log("");
});

// ==========================================
// UTILITY: Hitung uptime
// ==========================================
function getUptime(startTime) {
  const diff = Date.now() - startTime.getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

// ==========================================
// FUNGSI UTAMA: START BOT
// ==========================================
async function startBot() {
  // 1. Load session
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");

  // 2. Versi WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(
    `📌 Menggunakan WA Web v${version.join(".")}, isLatest: ${isLatest}`,
  );

  // 3. Buat socket
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
    browser: ["Bot WhatsApp", "Chrome", "1.0.0"],
  });

  // 4. Bind store
  store?.bind(sock.ev);

  // ==========================================
  // EVENT: CONNECTION UPDATE
  // ==========================================
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code
    if (qr) {
      console.log("\n╔═���════════════════════════════════════╗");
      console.log("║   📱 SCAN QR CODE DI BAWAH INI      ║");
      console.log("║   Buka WhatsApp > Linked Devices     ║");
      console.log("║   > Link a Device > Scan QR          ║");
      console.log("╚══════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
    }

    // Berhasil konek
    if (connection === "open") {
      botStatus.connected = true;

      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   ✅ BOT BERHASIL TERHUBUNG!         ║");
      console.log("║   Bot siap menerima pesan            ║");
      console.log("╚══════════════════════════════════════╝\n");
    }

    // Koneksi putus
    if (connection === "close") {
      botStatus.connected = false;

      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;

      console.log("❌ Koneksi terputus:", lastDisconnect?.error?.message);

      if (shouldReconnect) {
        console.log("🔄 Mencoba reconnect...");
        startBot();
      } else {
        console.log(
          "🚪 Bot logged out. Hapus folder auth_session dan scan ulang.",
        );
      }
    }
  });

  // ==========================================
  // EVENT: SIMPAN CREDENTIALS
  // ==========================================
  sock.ev.on("creds.update", saveCreds);

  // ==========================================
  // EVENT: PESAN MASUK → lempar ke handler.js
  // ==========================================
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      botStatus.messageCount++;
      await handleMessage(sock, msg);
    }
  });

  return sock;
}

// ==========================================
// JALANKAN
// ==========================================
console.log("╔══════════════════════════════════════╗");
console.log("║   🤖 BOT WHATSAPP - STARTING...     ║");
console.log("║   Library: atexovi-baileys           ║");
console.log("║   Anti-Idle: HTTP Keep-Alive         ║");
console.log("╚══════════════════════════════════════╝\n");

startBot().catch((err) => {
  console.error("Fatal error:", err);
});
