// ==========================================
//  HANDLER.JS - Frontend
//  Command, Menu, Admin System
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

// ==========================================
// PATH DATABASE ADMIN
// ==========================================
const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");

// ==========================================
// ADMIN DATABASE FUNCTIONS
// ==========================================

/**
 * Load daftar admin dari file JSON
 * @returns {string[]} Array nomor admin
 */
function loadAdmins() {
  try {
    const dir = path.dirname(ADMIN_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ADMIN_DB_PATH)) {
      fs.writeFileSync(ADMIN_DB_PATH, "[]");
      return [];
    }
    return JSON.parse(fs.readFileSync(ADMIN_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Simpan daftar admin ke file JSON
 * @param {string[]} admins - Array nomor admin
 */
function saveAdmins(admins) {
  const dir = path.dirname(ADMIN_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ADMIN_DB_PATH, JSON.stringify(admins, null, 2));
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Bersihkan nomor: hapus +, spasi, strip
 * Contoh: "+62 877-1901-0818" → "6287719010818"
 */
function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

/**
 * Ambil nomor dari JID
 * "6287719010818@s.whatsapp.net" → "6287719010818"
 */
function getNumberFromJid(jid) {
  return jid.split("@")[0];
}

/**
 * Format nomor jadi JID
 * "6287719010818" → "6287719010818@s.whatsapp.net"
 */
function numberToJid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

/**
 * Cek apakah nomor adalah OWNER
 */
function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

/**
 * Cek apakah nomor adalah ADMIN
 */
function isAdmin(number) {
  const admins = loadAdmins();
  const normalized = normalizeNumber(number);
  return admins.some((a) => normalizeNumber(a) === normalized);
}

/**
 * Cek apakah nomor adalah ADMIN atau OWNER
 */
function isAdminOrOwner(number) {
  return isOwner(number) || isAdmin(number);
}

// ==========================================
// HANDLER UTAMA
// ==========================================
async function handleMessage(sock, msg) {
  if (msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const sender = msg.pushName || "Unknown";

  // Ambil nomor bot & sender
  const botId = sock.user?.id?.replace(/:.*@/, "@") || "";
  const botNumber = botId.split("@")[0];
  const senderNumber = getNumberFromJid(
    msg.key.participant || msg.key.remoteJid,
  );

  // Extract teks
  let text = extractText(msg);
  let rawText = text.trim(); // simpan teks asli (case sensitive)
  text = text.toLowerCase().trim();

  // Cek mention bot
  const isBotMentioned = checkBotMentioned(msg, botNumber);

  console.log(
    `📩 Pesan dari ${sender} (${senderNumber}): ${text || "[non-text]"}`,
  );

  if (!text) return;

  // ==========================================
  // PARAMETERIZED COMMANDS (sebelum switch)
  // harus dicek duluan karena ada parameter
  // ==========================================
  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
    await handleAddAdmin(sock, msg, jid, senderNumber, rawText);
    return;
  }

  if (text.startsWith("/deladmin ") || text.startsWith("deladmin ")) {
    await handleDelAdmin(sock, jid, senderNumber, rawText);
    return;
  }

  // Handle response dari interactive delete list (deladmin_628xxxx)
  if (text.startsWith("deladmin_")) {
    await handleDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  // ==========================================
  // ROUTING COMMAND (exact match)
  // ==========================================
  try {
    switch (text) {
      // ============ MENU UTAMA ============
      case "menu":
      case "/menu":
      case "help":
      case "/help":
        await sendMainMenu(sock, jid, sender, senderNumber);
        break;

      // ============ DEMO FITUR ============
      case "button":
      case "/button":
        await sendButtonMessage(sock, jid);
        break;

      case "list":
      case "/list":
        await sendListMessage(sock, jid);
        break;

      case "template":
      case "/template":
        await sendTemplateButton(sock, jid);
        break;

      case "image":
      case "/image":
        await sendImageWithButton(sock, jid);
        break;

      // ============ RESPONSE INTERACTIVE MENU ============
      case "menu_button":
        await sendButtonMessage(sock, jid);
        break;

      case "menu_list":
        await sendListMessage(sock, jid);
        break;

      case "menu_template":
        await sendTemplateButton(sock, jid);
        break;

      case "menu_image":
        await sendImageWithButton(sock, jid);
        break;

      case "menu_info":
        await sock.sendMessage(jid, {
          text:
            "📌 *INFO BOT*\n\n" +
            `Bot ini dibuat menggunakan atexovi-baileys.\n\n` +
            `• *Nama:* ${config.botName}\n` +
            `• *Version:* ${config.version}\n` +
            `• *Library:* atexovi-baileys\n` +
            `• *Runtime:* Node.js`,
        });
        break;

      case "menu_ping":
        const pingStart = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 *PONG!*\n\nSpeed: ${Date.now() - pingStart}ms\nStatus: Online ✅`,
        });
        break;

      case "menu_creator":
        await sock.sendMessage(jid, {
          text:
            "👨‍💻 *CREATOR*\n\n" +
            "Bot dibuat oleh Developer\n" +
            "GitHub: https://github.com/iamrnldo",
        });
        break;

      // ==========================================
      // ADMIN PANEL - RESPONSE DARI INTERACTIVE LIST
      // ==========================================
      case "admin_add":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sock.sendMessage(jid, {
          text:
            "➕ *ADD ADMIN*\n\n" +
            "Gunakan salah satu cara berikut:\n\n" +
            "📝 *Cara 1:* Ketik nomor\n" +
            "```/addadmin 628xxxxxxxxxx```\n\n" +
            "📝 *Cara 2:* Tag user (di grup)\n" +
            "```/addadmin @user```\n\n" +
            "⚠️ Format nomor: 628xxxxx (tanpa +)",
        });
        break;

      case "admin_del":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sendAdminDeleteList(sock, jid, senderNumber);
        break;

      case "admin_list":
      case "/listadmin":
      case "listadmin":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sendAdminList(sock, jid);
        break;

      // ============ RESPONSE BUTTON MESSAGE ============
      case "btn_info":
        await sock.sendMessage(jid, {
          text:
            "📌 *INFO BOT*\n\n" +
            "Bot ini dibuat menggunakan atexovi-baileys.\n" +
            "Bot mendukung button, list, dan template message!",
        });
        break;

      case "btn_creator":
        await sock.sendMessage(jid, {
          text:
            "👨‍💻 *CREATOR*\n\n" +
            "Bot dibuat oleh Developer\n" +
            "GitHub: https://github.com/iamrnldo",
        });
        break;

      case "btn_ping":
        const start = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong!\nSpeed: ${Date.now() - start}ms`,
        });
        break;

      // ============ RESPONSE LIST MESSAGE ============
      case "list_games":
        await sock.sendMessage(jid, {
          text:
            "🎮 *FITUR GAMES*\n\n" +
            "• Tebak Gambar\n• Tebak Kata\n• Quiz\n\n_Coming Soon!_",
        });
        break;

      case "list_tools":
        await sock.sendMessage(jid, {
          text:
            "🔧 *FITUR TOOLS*\n\n" +
            "• Sticker Maker\n• Image to PDF\n• QR Generator\n\n_Coming Soon!_",
        });
        break;

      case "list_downloader":
        await sock.sendMessage(jid, {
          text:
            "📥 *FITUR DOWNLOADER*\n\n" +
            "• YouTube Downloader\n• Instagram Downloader\n• TikTok Downloader\n\n_Coming Soon!_",
        });
        break;

      case "list_info":
        await sock.sendMessage(jid, {
          text:
            "📋 *INFO*\n\n" +
            `Bot Version: ${config.version}\n` +
            "Library: atexovi-baileys\nRuntime: Node.js",
        });
        break;

      // ============ DEFAULT ============
      default:
        if (isBotMentioned) {
          await sock.sendMessage(jid, {
            text:
              `👋 Halo *${sender}*!\n\n` +
              `Ketik *menu* untuk melihat daftar perintah.\n\n` +
              `Bot ini mendukung:\n` +
              `• Interactive List Button\n` +
              `• Button Message\n` +
              `• List Message\n` +
              `• Template Button`,
          });
        }
        break;
    }
  } catch (error) {
    console.error("❗ Error handling message:", error);
  }
}

// ==========================================
// ADMIN: HANDLE ADD ADMIN
// ==========================================
async function handleAddAdmin(sock, msg, jid, senderNumber, rawText) {
  // Cek permission
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa menambah admin.",
    });
    return;
  }

  let targetNumber = "";

  // Cara 1: Dari mention (tag @user)
  const mentionedJids =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentionedJids.length > 0) {
    targetNumber = getNumberFromJid(mentionedJids[0]);
  } else {
    // Cara 2: Dari teks (ambil angka setelah command)
    const parts = rawText.split(/\s+/);
    if (parts.length >= 2) {
      targetNumber = normalizeNumber(parts[1]);
    }
  }

  // Validasi
  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text:
        "❌ *FORMAT SALAH*\n\n" +
        "Gunakan:\n" +
        "```/addadmin 628xxxxxxxxxx```\n" +
        "atau tag user:\n" +
        "```/addadmin @user```",
    });
    return;
  }

  // Cek apakah sudah jadi owner
  if (isOwner(targetNumber)) {
    await sock.sendMessage(jid, {
      text: "👑 Nomor tersebut adalah *Owner*, tidak perlu dijadikan admin.",
    });
    return;
  }

  // Cek apakah sudah jadi admin
  if (isAdmin(targetNumber)) {
    await sock.sendMessage(jid, {
      text: `⚠️ Nomor *${targetNumber}* sudah menjadi admin.`,
    });
    return;
  }

  // Tambahkan admin
  const admins = loadAdmins();
  admins.push(targetNumber);
  saveAdmins(admins);

  console.log(`✅ Admin ditambahkan: ${targetNumber} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN DITAMBAHKAN*\n\n` +
      `📱 Nomor: ${targetNumber}\n` +
      `👤 Ditambahkan oleh: ${senderNumber}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: HANDLE DELETE ADMIN (dari command)
// ==========================================
async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  // Cek permission
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa menghapus admin.",
    });
    return;
  }

  // Ambil nomor dari teks
  const parts = rawText.split(/\s+/);
  let targetNumber = "";

  if (parts.length >= 2) {
    targetNumber = normalizeNumber(parts[1]);
  }

  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text:
        "❌ *FORMAT SALAH*\n\n" +
        "Gunakan:\n" +
        "```/deladmin 628xxxxxxxxxx```\n\n" +
        "Atau pilih dari menu:\n" +
        "Ketik */menu* → Admin Panel → Delete Admin",
    });
    return;
  }

  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

// ==========================================
// ADMIN: HANDLE DELETE DARI INTERACTIVE LIST
// ==========================================
async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  // Cek permission
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*",
    });
    return;
  }

  // Format: "deladmin_628xxxx"
  const targetNumber = text.replace("deladmin_", "");
  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

// ==========================================
// ADMIN: EXECUTE DELETE (shared logic)
// ==========================================
async function executeDeleteAdmin(sock, jid, senderNumber, targetNumber) {
    // Cek apakah target adalah admin
    
     if (isOwner(targetNumber)) {
       await sock.sendMessage(jid, {
         text:
           "⛔ *TIDAK BISA MENGHAPUS OWNER*\n\n" +
           `👑 Nomor *${targetNumber}* adalah Owner bot.\n` +
           "Owner tidak bisa dihapus oleh siapapun.",
       });
       return;
     }


  if (!isAdmin(targetNumber)) {
    await sock.sendMessage(jid, {
      text: `❌ Nomor *${targetNumber}* bukan admin.`,
    });
    return;
  }

//   Cegah admin menghapus diri sendiri (opsional)
  if (normalizeNumber(senderNumber) === normalizeNumber(targetNumber)) {
    await sock.sendMessage(jid, { text: "❌ Tidak bisa menghapus diri sendiri." });
    return;
  }

  // Hapus admin
  let admins = loadAdmins();
  admins = admins.filter(
    (a) => normalizeNumber(a) !== normalizeNumber(targetNumber),
  );
  saveAdmins(admins);

  console.log(`🗑️ Admin dihapus: ${targetNumber} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: ${targetNumber}\n` +
      `👤 Dihapus oleh: ${senderNumber}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: KIRIM LIST ADMIN
// ==========================================
async function sendAdminList(sock, jid) {
  const admins = loadAdmins();

  let text =
    `╔══════════════════════╗\n` +
    `║  🔐 *DAFTAR ADMIN*   ║\n` +
    `╚══════════════════════╝\n\n`;

  // Owner
  text += `👑 *OWNER:*\n`;
  text += `└ 📱 ${config.ownerNumber}\n\n`;

  // Admin list
  text += `🛡️ *ADMIN (${admins.length}):*\n`;

  if (admins.length === 0) {
    text += `└ _Belum ada admin_\n`;
  } else {
    admins.forEach((admin, index) => {
      const prefix = index === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 ${admin}\n`;
    });
  }

  text += `\n📊 *Total:* ${admins.length + 1} (termasuk owner)`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// ADMIN: KIRIM INTERACTIVE LIST UNTUK DELETE
// ==========================================
async function sendAdminDeleteList(sock, jid, senderNumber) {
    const admins = loadAdmins();
    

    const deletableAdmins = admins.filter((admin) => !isOwner(admin));

  // Kalau tidak ada admin
  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text:
        "📋 *DELETE ADMIN*\n\n" +
        "_Belum ada admin yang terdaftar._\n\n" +
        "Tambah admin dulu dengan:\n" +
        "```/addadmin 628xxxxxxxxxx```",
    });
    return;
  }

  // Buat rows dari daftar admin
  const rows = admins.map((admin, index) => ({
    header: `Admin #${index + 1}`,
    title: admin,
    description: `Hapus ${admin} dari daftar admin`,
    id: `deladmin_${admin}`,
  }));

  await sock.sendMessage(jid, {
    text:
      `🗑️ *DELETE ADMIN*\n\n` +
      `Pilih admin yang ingin dihapus dari daftar.\n` +
      `Total admin: *${deletableAdmins.length}*\n\n` +
      `👑 _Owner (${config.ownerNumber}) tidak bisa dihapus._`,
    title: "Hapus Admin",
    subtitle: "Pilih admin untuk dihapus",
    footer: "⚠️ Owner dilindungi, tidak bisa dihapus",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Admin",
          sections: [
            {
              title: "🛡️ Daftar Admin (tanpa Owner)",
              highlight_label: `${deletableAdmins.length} Admin`,
              rows: rows,
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// EXTRACT TEXT DARI BERBAGAI FORMAT PESAN
// ==========================================
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.buttonsResponseMessage?.selectedButtonId)
    return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId)
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.templateButtonReplyMessage?.selectedId)
    return m.templateButtonReplyMessage.selectedId;

  // Interactive button response
  if (m.interactiveResponseMessage) {
    try {
      const body =
        m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
      if (body) {
        const parsed = JSON.parse(body);
        return parsed.id || "";
      }
    } catch (e) {
      console.error("Error parsing interactive response:", e);
    }
  }

  return "";
}

// ==========================================
// CEK BOT DI-MENTION
// ==========================================
function checkBotMentioned(msg, botNumber) {
  const m = msg.message;
  if (!m) return false;

  const mentionedJids = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
  for (const mentioned of mentionedJids) {
    if (mentioned.startsWith(botNumber)) return true;
  }

  let text = "";
  if (m.conversation) text = m.conversation;
  if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;

  return text.includes(`@${botNumber}`);
}

// ==========================================
// ⭐ MENU UTAMA - INTERACTIVE LIST
// ==========================================
async function sendMainMenu(sock, jid, sender, senderNumber) {
  // Section dasar (semua user)
  const sections = [
    {
      title: "📨 Fitur Message",
      highlight_label: "Populer",
      rows: [
        {
          header: "🔘 Button",
          title: "Button Message",
          description: "Kirim pesan dengan tombol interaktif",
          id: "menu_button",
        },
        {
          header: "📋 List",
          title: "List Message",
          description: "Kirim pesan dengan daftar pilihan",
          id: "menu_list",
        },
        {
          header: "📎 Template",
          title: "Template Button",
          description: "URL, Call, dan Quick Reply button",
          id: "menu_template",
        },
        {
          header: "🖼️ Image",
          title: "Image + Button",
          description: "Kirim gambar dengan tombol",
          id: "menu_image",
        },
      ],
    },
    {
      title: "ℹ️ Informasi",
      rows: [
        {
          header: "📌 Info",
          title: "Info Bot",
          description: "Lihat informasi lengkap tentang bot",
          id: "menu_info",
        },
        {
          header: "👨‍💻 Dev",
          title: "Creator",
          description: "Informasi pembuat bot",
          id: "menu_creator",
        },
      ],
    },
    {
      title: "⚡ Utilities",
      rows: [
        {
          header: "🏓 Ping",
          title: "Speed Test",
          description: "Cek kecepatan response bot",
          id: "menu_ping",
        },
      ],
    },
  ];

  // ==========================================
  // ADMIN SECTION (hanya muncul untuk admin/owner)
  // ==========================================
  if (isAdminOrOwner(senderNumber)) {
    const admins = loadAdmins();
    const roleLabel = isOwner(senderNumber) ? "👑 Owner" : "🛡️ Admin";

    sections.push({
      title: `🔐 Admin Panel [${roleLabel}]`,
      highlight_label: "Restricted",
      rows: [
        {
          header: "➕ Add",
          title: "Tambah Admin",
          description: "Tambahkan admin baru ke bot",
          id: "admin_add",
        },
        {
          header: "➖ Delete",
          title: "Hapus Admin",
          description: `Hapus admin (saat ini: ${admins.length} admin)`,
          id: "admin_del",
        },
        {
          header: "📋 List",
          title: "Daftar Admin",
          description: "Lihat semua admin yang terdaftar",
          id: "admin_list",
        },
      ],
    });
  }

  // Bangun teks menu
  const roleText = isOwner(senderNumber)
    ? "👑 Role: *Owner*"
    : isAdmin(senderNumber)
      ? "🛡️ Role: *Admin*"
      : "👤 Role: *User*";

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════╗\n` +
      `║  🤖 *MENU BOT WA*   ║\n` +
      `╚══════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n` +
      `${roleText}\n\n` +
      `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n\n` +
      `Silakan pilih menu dari daftar di bawah 👇`,
    title: config.botName,
    subtitle: "Pilih salah satu fitur",
    footer: `© 2024 ${config.botName} | atexovi-baileys`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Buka Daftar Menu",
          sections: sections,
        }),
      },
    ],
  });
}

// ==========================================
// BUTTON MESSAGE
// ==========================================
async function sendButtonMessage(sock, jid) {
  const buttons = [
    {
      buttonId: "btn_info",
      buttonText: { displayText: "📌 Info Bot" },
      type: 1,
    },
    {
      buttonId: "btn_creator",
      buttonText: { displayText: "👨‍💻 Creator" },
      type: 1,
    },
    { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
  ];

  await sock.sendMessage(jid, {
    text:
      "🔘 *BUTTON MESSAGE*\n\n" +
      "Ini adalah contoh Button Message.\n" +
      "Silakan tekan salah satu tombol di bawah!",
    footer: "Pilih salah satu button 👇",
    buttons,
    headerType: 1,
  });
}

// ==========================================
// LIST MESSAGE
// ==========================================
async function sendListMessage(sock, jid) {
  const sections = [
    {
      title: "🎮 Games",
      rows: [
        {
          title: "🎮 Games",
          rowId: "list_games",
          description: "Fitur game seru di bot",
        },
      ],
    },
    {
      title: "🔧 Tools",
      rows: [
        {
          title: "🔧 Tools",
          rowId: "list_tools",
          description: "Berbagai tools berguna",
        },
      ],
    },
    {
      title: "📥 Downloader",
      rows: [
        {
          title: "📥 Downloader",
          rowId: "list_downloader",
          description: "Download video & audio",
        },
      ],
    },
    {
      title: "📋 Information",
      rows: [
        {
          title: "📋 Info Bot",
          rowId: "list_info",
          description: "Informasi tentang bot",
        },
      ],
    },
  ];

  await sock.sendMessage(jid, {
    text:
      "📋 *LIST MESSAGE*\n\n" +
      "Ini adalah contoh List Message.\n" +
      "Tekan tombol di bawah untuk melihat daftar fitur!",
    footer: "© 2024 Bot WhatsApp",
    title: "Menu List",
    buttonText: "📋 Lihat Daftar Menu",
    sections,
  });
}

// ==========================================
// TEMPLATE BUTTON
// ==========================================
async function sendTemplateButton(sock, jid) {
  const templateButtons = [
    {
      index: 1,
      urlButton: {
        displayText: "🌐 GitHub Repository",
        url: "https://github.com/atex-ovi/atexovi-baileys",
      },
    },
    {
      index: 2,
      callButton: {
        displayText: "📞 Hubungi Kami",
        phoneNumber: "+6281234567890",
      },
    },
    {
      index: 3,
      quickReplyButton: { displayText: "🔄 Quick Reply", id: "btn_info" },
    },
  ];

  await sock.sendMessage(jid, {
    text:
      "📎 *TEMPLATE BUTTON*\n\n" +
      "Ini adalah contoh Template Button Message.\n" +
      "Ada 3 jenis button:\n\n" +
      "• 🌐 URL Button (buka link)\n" +
      "• 📞 Call Button (telepon)\n" +
      "• 🔄 Quick Reply Button",
    footer: "© 2024 Bot WhatsApp",
    templateButtons,
  });
}

// ==========================================
// IMAGE + BUTTON
// ==========================================
async function sendImageWithButton(sock, jid) {
  const buttons = [
    { buttonId: "btn_info", buttonText: { displayText: "📌 Info" }, type: 1 },
    { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
  ];

  await sock.sendMessage(jid, {
    image: { url: "https://picsum.photos/500/300" },
    caption:
      "🖼️ *IMAGE + BUTTON*\n\nIni adalah contoh pesan gambar dengan button!",
    footer: "© 2024 Bot WhatsApp",
    buttons,
    headerType: 4,
  });
}

// ==========================================
// EXPORT
// ==========================================
module.exports = { handleMessage };
