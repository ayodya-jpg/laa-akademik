require("dotenv").config();

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { processChat } = require("./chatService");
const { loadDocuments } = require("./documentService");

const BOT_NAME = process.env.BOT_NAME || "LAA Akademik Bot";
const INACTIVITY_LIMIT_MS = 90 * 1000;

function findBrowserPath() {
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google\\Chrome\\Application\\chrome.exe"
    ),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft\\Edge\\Application\\msedge.exe"
    )
  ];

  return possiblePaths.find((browserPath) => fs.existsSync(browserPath));
}

const browserPath = findBrowserPath();

if (!browserPath) {
  console.error("Chrome atau Microsoft Edge tidak ditemukan.");
  console.error("Solusi 1: Install Google Chrome.");
  console.error("Solusi 2: Jalankan: npx puppeteer browsers install chrome");
  console.error("Solusi 3: Cek lokasi chrome.exe lalu masukkan manual ke executablePath.");
  process.exit(1);
}

console.log("Browser ditemukan:", browserPath);

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "laa-akademik-bot"
  }),

  webVersionCache: {
    type: "none"
  },

  puppeteer: {
    headless: false,
    executablePath: browserPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions"
    ]
  }
});

const userCooldown = new Map();
const processingUsers = new Set();
const userSessions = new Map();
const ratingSessions = new Map();

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isOnCooldown(userId) {
  const now = Date.now();
  const lastMessageTime = userCooldown.get(userId) || 0;
  const cooldownMs = 1200;

  if (now - lastMessageTime < cooldownMs) {
    return true;
  }

  userCooldown.set(userId, now);
  return false;
}

function isGroupMessage(message) {
  return String(message.from || "").endsWith("@g.us");
}

function isAllowedMessageType(message) {
  return message.type === "chat";
}

function clearUserSession(userId) {
  const session = userSessions.get(userId);

  if (session && session.timer) {
    clearTimeout(session.timer);
  }

  userSessions.delete(userId);
}

function startOrResetInactivityTimer(userId) {
  clearUserSession(userId);

  const timer = setTimeout(async () => {
    try {
      await sendRatingRequest(userId);
    } catch (error) {
      console.error("Gagal mengirim rating saat timeout:", error);
    } finally {
      clearUserSession(userId);
    }
  }, INACTIVITY_LIMIT_MS);

  userSessions.set(userId, {
    timer,
    lastInteractionAt: Date.now()
  });
}

function removeSourceSection(answer) {
  return String(answer || "")
    .replace(
      /📌\s*\*?Sumber dokumen:\*?[\s\S]*?(?=\n\nKamu bisa|\nKamu bisa|$)/gi,
      ""
    )
    .replace(
      /📌\s*Sumber dokumen:[\s\S]*?(?=\n\nKamu bisa|\nKamu bisa|$)/gi,
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatWhatsAppAnswer(answer) {
  return removeSourceSection(answer)
    .replace(/\*\*/g, "*")
    .replace(
      /Kamu bisa tanya lagi dengan lebih spesifik/g,
      "\nKamu bisa tanya lagi dengan lebih spesifik"
    )
    .trim();
}

function getWelcomeMessage() {
  return `Halo! 👋 Aku *${BOT_NAME}*.

Aku bisa membantu kamu mencari informasi akademik Telkom University Surabaya.

Kamu bisa ketik:
- menu
- jadwal registrasi
- jadwal PRS
- maksimal SKS
- syarat sidang TA
- NIP Dosen

Silakan tulis pertanyaan kamu ya 😊`;
}

function isFirstGreeting(text) {
  const normalized = normalizeText(text);

  const greetings = [
    "halo",
    "hai",
    "hallo",
    "hello",
    "hi",
    "pagi",
    "siang",
    "sore",
    "malam",
    "assalamualaikum",
    "permisi"
  ];

  return greetings.includes(normalized);
}

function isMenuMessage(text) {
  const normalized = normalizeText(text);

  return [
    "menu",
    "menu utama",
    "main menu",
    "kembali ke menu",
    "bantuan",
    "help"
  ].some((word) => normalized === word || normalized.includes(word));
}

function isClosingMessage(text) {
  const normalized = normalizeText(text);

  const closingPatterns = [
    "makasih",
    "makasi",
    "terima kasih",
    "terimakasih",
    "thanks",
    "thank you",
    "thankyou",
    "tengkyu",
    "mksh",
    "sudah cukup",
    "cukup",
    "oke makasih",
    "ok makasih",
    "baik makasih",
    "sip makasih",
    "selesai",
    "sudah selesai",
    "bye",
    "dadah",
    "dah",
    "sampai jumpa",
    "see you"
  ];

  return closingPatterns.some((pattern) => normalized.includes(pattern));
}

async function sendRatingRequest(userId) {
  ratingSessions.set(userId, {
    waitingRating: true,
    createdAt: Date.now()
  });

  await client.sendMessage(
    userId,
    `Luangkan 5 detik waktumu agar kami bisa lebih baik 🙏

Apakah kamu puas dengan layanan chatbot ini?

Balas dengan angka:

1. Sangat Tidak Puas
2. Tidak Puas
3. Cukup Puas
4. Puas
5. Sangat Puas

Ketik *menu* untuk kembali ke menu utama.`
  );
}

function extractRating(value) {
  const normalized = normalizeText(value);

  if (normalized === "1" || normalized.includes("sangat tidak puas")) {
    return 1;
  }

  if (normalized === "2" || normalized.includes("tidak puas")) {
    return 2;
  }

  if (normalized === "3" || normalized.includes("cukup puas")) {
    return 3;
  }

  if (normalized === "4" || normalized === "puas") {
    return 4;
  }

  if (normalized === "5" || normalized.includes("sangat puas")) {
    return 5;
  }

  return null;
}

function getRatingLabel(rating) {
  const labels = {
    1: "Sangat Tidak Puas",
    2: "Tidak Puas",
    3: "Cukup Puas",
    4: "Puas",
    5: "Sangat Puas"
  };

  return labels[rating] || "Tidak diketahui";
}

function ensureRatingFile() {
  const ratingPath = path.join(__dirname, "../data/wa-ratings.json");
  const dataDir = path.dirname(ratingPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
      recursive: true
    });
  }

  if (!fs.existsSync(ratingPath)) {
    fs.writeFileSync(ratingPath, "[]");
  }

  return ratingPath;
}

function saveRating(userId, rating) {
  const ratingPath = ensureRatingFile();

  let ratings = [];

  try {
    const raw = fs.readFileSync(ratingPath, "utf-8");
    ratings = raw.trim() ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Gagal membaca file rating:", error);
    ratings = [];
  }

  ratings.push({
    userId,
    rating,
    label: getRatingLabel(rating),
    createdAt: new Date().toISOString()
  });

  try {
    fs.writeFileSync(ratingPath, JSON.stringify(ratings, null, 2));
    console.log("Rating tersimpan:", {
      userId,
      rating,
      label: getRatingLabel(rating)
    });
  } catch (error) {
    console.error("Gagal menyimpan rating:", error);
  }
}

function getFinalClosingMessage(rating) {
  if (rating >= 4) {
    return `Terima kasih atas penilaiannya 😊

Senang sekali layanan *${BOT_NAME}* bisa membantu kamu.

Percakapan ini aku akhiri dulu ya. Kalau nanti ada pertanyaan akademik lain, silakan hubungi aku kembali.

Terima kasih sudah menghubungi *${BOT_NAME}*.`;
  }

  return `Terima kasih atas penilaiannya 😊

Masukan kamu akan membantu kami meningkatkan layanan *${BOT_NAME}* agar lebih baik lagi.

Percakapan ini aku akhiri dulu ya. Kalau nanti masih membutuhkan bantuan akademik, silakan hubungi aku kembali.

Terima kasih sudah menghubungi *${BOT_NAME}*.`;
}

async function handleRating(message, sender, text) {
  if (!ratingSessions.has(sender)) {
    return false;
  }

  if (isMenuMessage(text)) {
    ratingSessions.delete(sender);
    await replySafely(message, getWelcomeMessage());
    startOrResetInactivityTimer(sender);
    return true;
  }

  const rating = extractRating(text);

  if (!rating) {
    await replySafely(
      message,
      `Mohon balas dengan angka 1 sampai 5 ya 😊

1. Sangat Tidak Puas
2. Tidak Puas
3. Cukup Puas
4. Puas
5. Sangat Puas

Atau ketik *menu* untuk kembali ke menu utama.`
    );

    return true;
  }

  saveRating(sender, rating);

  ratingSessions.delete(sender);
  clearUserSession(sender);

  await replySafely(message, getFinalClosingMessage(rating));

  return true;
}

async function replySafely(message, text) {
  const safeText = String(text || "").trim();

  if (!safeText) {
    await message.reply(
      "Maaf, aku belum bisa memberikan jawaban untuk pertanyaan itu."
    );
    return;
  }

  const maxLength = 3500;

  if (safeText.length <= maxLength) {
    await message.reply(safeText);
    return;
  }

  for (let i = 0; i < safeText.length; i += maxLength) {
    const part = safeText.slice(i, i + maxLength).trim();

    if (part) {
      await message.reply(part);
    }
  }
}

client.on("qr", (qr) => {
  console.log("\n====================================");
  console.log("Scan QR berikut menggunakan WhatsApp:");
  console.log("WhatsApp > Perangkat Tertaut > Tautkan Perangkat");
  console.log("====================================\n");

  qrcode.generate(qr, {
    small: true
  });
});

client.on("loading_screen", (percent, message) => {
  console.log(`Loading WhatsApp: ${percent}% - ${message}`);
});

client.on("authenticated", () => {
  console.log("WhatsApp berhasil terautentikasi.");
});

client.on("auth_failure", (message) => {
  console.error("Autentikasi WhatsApp gagal:", message);
  console.error("Solusi: hapus folder .wwebjs_auth lalu jalankan ulang npm run wa.");
});

client.on("ready", () => {
  console.log("WhatsApp Bot siap digunakan.");
});

client.on("disconnected", (reason) => {
  console.log("WhatsApp Bot terputus:", reason);
  console.log("Silakan jalankan ulang npm run wa jika diperlukan.");
});

client.on("message", async (message) => {
  const sender = message.from;

  try {
    const text = String(message.body || "").trim();

    if (!text) return;
    if (message.fromMe) return;

    if (isGroupMessage(message)) {
      return;
    }

    if (!isAllowedMessageType(message)) {
      await message.reply(
        "Maaf, saat ini aku hanya bisa memproses pesan teks dulu ya 😊"
      );
      startOrResetInactivityTimer(sender);
      return;
    }

    if (isOnCooldown(sender)) {
      return;
    }

    const ratingHandled = await handleRating(message, sender, text);

    if (ratingHandled) {
      return;
    }

    if (processingUsers.has(sender)) {
      await message.reply(
        "Pertanyaan sebelumnya masih diproses ya. Mohon tunggu sebentar 😊"
      );
      return;
    }

    processingUsers.add(sender);

    console.log("Pesan WhatsApp masuk:", {
      from: sender,
      text
    });

    if (isClosingMessage(text)) {
      await sendRatingRequest(sender);

      processingUsers.delete(sender);
      clearUserSession(sender);
      return;
    }

    if (isFirstGreeting(text) || isMenuMessage(text)) {
      await replySafely(message, getWelcomeMessage());

      processingUsers.delete(sender);
      startOrResetInactivityTimer(sender);
      return;
    }

    const chat = await message.getChat();

    if (chat && typeof chat.sendStateTyping === "function") {
      await chat.sendStateTyping();
    }

    const result = await processChat(text);
    const answer = formatWhatsAppAnswer(result.answer);

    await replySafely(message, answer);

    if (chat && typeof chat.clearState === "function") {
      await chat.clearState();
    }

    processingUsers.delete(sender);
    startOrResetInactivityTimer(sender);
  } catch (error) {
    console.error("WhatsApp Chat Error:", error);

    processingUsers.delete(sender);
    startOrResetInactivityTimer(sender);

    try {
      await message.reply(
        "Maaf, sedang terjadi kendala pada sistem chatbot. Silakan coba lagi beberapa saat ya."
      );
    } catch (replyError) {
      console.error("Gagal mengirim pesan error ke WhatsApp:", replyError);
    }
  }
});

async function startWhatsAppBot() {
  try {
    console.log("Memuat dataset chatbot...");
    await loadDocuments();

    console.log("Menjalankan WhatsApp Bot...");
    client.initialize();
  } catch (error) {
    console.error("Gagal menjalankan WhatsApp Bot:", error);
  }
}

startWhatsAppBot();