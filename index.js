// ==========================================
//  INDEX.JS - Backend
//  Koneksi WhatsApp, auth, reconnect, event listener
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

// Import handler (frontend)
const { handleMessage } = require("./handler");

// ==========================================
// KONFIGURASI
// ==========================================
const logger = pino({ level: "silent" });

const store = makeInMemoryStore({ logger });
store?.readFromFile("./store.json");
setInterval(() => {
  store?.writeToFile("./store.json");
}, 10_000);

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
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   📱 SCAN QR CODE DI BAWAH INI      ║");
      console.log("║   Buka WhatsApp > Linked Devices     ║");
      console.log("║   > Link a Device > Scan QR          ║");
      console.log("╚══════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
    }

    // Berhasil konek
    if (connection === "open") {
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   ✅ BOT BERHASIL TERHUBUNG!         ║");
      console.log("║   Bot siap menerima pesan            ║");
      console.log("╚══════════════════════════════════════╝\n");
    }

    // Koneksi putus
    if (connection === "close") {
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
console.log("╚══════════════════════════════════════╝\n");

startBot().catch((err) => {
  console.error("Fatal error:", err);
});
