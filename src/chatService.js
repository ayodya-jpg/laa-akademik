const { searchRelevantDocuments } = require("./documentService");
const { askGroq } = require("./aiService");
const {
  isUpdateCommand,
  parseUpdateCommand,
  createUpdate,
  isResetCommand,
  parseResetCommand,
  resetUpdates
} = require("./updateService");
const chatbotConfig = require("./config/chatbotConfig");

let pendingAdminAction = null;

function isGreeting(message) {
  const text = message.toLowerCase();

  return [
    "halo",
    "hai",
    "hallo",
    "hello",
    "hi",
    "pagi",
    "siang",
    "sore",
    "malam",
    "assalamualaikum"
  ].some((word) => text.includes(word));
}

function isMenuRequest(message) {
  const text = message.toLowerCase();

  return ["menu", "help", "bantuan", "mulai", "fitur", "start"].some((word) =>
    text.includes(word)
  );
}

function getMainMenu() {
  const menuText = chatbotConfig.menus
    .map((menu) => `${menu.number}. ${menu.label}`)
    .join("\n");

  return `Halo! 👋 Saya ${chatbotConfig.botName}.

Saya bisa membantu kamu mencari informasi akademik berdasarkan dokumen dan data yang tersedia.

Silakan pilih menu berikut:

${menuText}

Kamu juga bisa langsung bertanya dengan bahasa bebas.

Contoh:
- "kapan registrasi semester genap?"
- "berapa maksimal SKS kalau IPS di atas 3?"
- "bagaimana cara daftar sidang TA?"
- "apa saja berkas sidang TA?"
- "kapan yudisium?"
- "siapa dosen pengampu?"

Perintah khusus admin:
- update pendaftaran TA jadi 17 Januari 2026
- ubah NIP dosen Budi menjadi 198706122019031002
- reset update pendaftaran TA
- reset update NIP dosen alifiansyah
- reset semua update

Setiap update dan reset membutuhkan PIN admin.`;
}

function convertMenuToQuestion(message) {
  const text = message.trim().toLowerCase();

  const selectedMenu = chatbotConfig.menus.find(
    (menu) => menu.number === text
  );

  return selectedMenu ? selectedMenu.query : message;
}

function isPendingActionExpired() {
  if (!pendingAdminAction) {
    return true;
  }

  const now = Date.now();
  const createdAt = pendingAdminAction.createdAt || 0;
  const expiredInMs = 2 * 60 * 1000;

  return now - createdAt > expiredInMs;
}

function clearPendingAction() {
  pendingAdminAction = null;
}

function handleUpdateCommand(message) {
  const parsed = parseUpdateCommand(message);

  if (!parsed) {
    return {
      answer:
        "Format update belum sesuai.\n\nContoh format yang benar:\n- update pendaftaran TA jadi 17 Januari 2026\n- ubah NIP dosen Budi menjadi 198706122019031002",
      sources: []
    };
  }

  pendingAdminAction = {
    type: "update",
    originalMessage: parsed.originalMessage,
    topic: parsed.topic,
    value: parsed.value,
    createdAt: Date.now()
  };

  return {
    answer: `Perintah update terdeteksi.

Detail update:
Topik: ${parsed.topic}
Nilai baru: ${parsed.value}

Silakan masukkan PIN admin untuk melanjutkan update.

Catatan: PIN berlaku selama 2 menit. Jika tidak memasukkan PIN, update akan dibatalkan otomatis.`,
    sources: []
  };
}

function handleResetCommand(message) {
  const parsed = parseResetCommand(message);

  if (!parsed) {
    return {
      answer:
        "Format reset belum sesuai.\n\nContoh format yang benar:\n- reset update pendaftaran TA\n- reset update NIP dosen alifiansyah\n- reset semua update",
      sources: []
    };
  }

  pendingAdminAction = {
    type: "reset",
    originalMessage: parsed.originalMessage,
    resetType: parsed.type,
    topic: parsed.topic,
    createdAt: Date.now()
  };

  return {
    answer: `Perintah reset terdeteksi.

Detail reset:
Jenis reset: ${parsed.type === "all" ? "Reset semua update" : "Reset berdasarkan topik"}
Topik: ${parsed.topic}

Silakan masukkan PIN admin untuk melanjutkan reset.

Catatan: PIN berlaku selama 2 menit. Jika tidak memasukkan PIN, reset akan dibatalkan otomatis.`,
    sources: []
  };
}

function handleAdminPin(message) {
  if (!pendingAdminAction) {
    return null;
  }

  if (isPendingActionExpired()) {
    clearPendingAction();

    return {
      answer:
        "Waktu input PIN sudah habis. Perintah admin dibatalkan.\n\nSilakan ulangi perintah update atau reset jika masih ingin melanjutkan.",
      sources: []
    };
  }

  const inputPin = String(message || "").trim();
  const adminPin = String(process.env.ADMIN_PIN || "").trim();

  if (!adminPin) {
    clearPendingAction();

    return {
      answer:
        "PIN admin belum diatur di file .env.\n\nTambahkan ADMIN_PIN=123456 di file .env, lalu restart server.",
      sources: []
    };
  }

  if (inputPin !== adminPin) {
    clearPendingAction();

    return {
      answer:
        "PIN salah. Perintah admin dibatalkan.\n\nSilakan ulangi perintah update atau reset jika ingin mencoba lagi.",
      sources: []
    };
  }

  let result;

  if (pendingAdminAction.type === "update") {
    result = createUpdate(pendingAdminAction.originalMessage);
  } else if (pendingAdminAction.type === "reset") {
    result = resetUpdates(pendingAdminAction.originalMessage);
  } else {
    result = {
      message: "Perintah admin tidak dikenali."
    };
  }

  clearPendingAction();

  return {
    answer: result.message,
    sources: []
  };
}

async function processChat(message) {
  const cleanMessage = message.trim();

  const pendingPinResponse = handleAdminPin(cleanMessage);

  if (pendingPinResponse) {
    return pendingPinResponse;
  }

  /*
    Penting:
    Reset harus dicek sebelum masuk ke proses tanya-jawab AI.
    Kalau tidak, kalimat seperti "reset update NIP dosen alifiansyah"
    akan dianggap pertanyaan biasa.
  */
  if (isResetCommand(cleanMessage)) {
    return handleResetCommand(cleanMessage);
  }

  if (isUpdateCommand(cleanMessage)) {
    return handleUpdateCommand(cleanMessage);
  }

  if (isGreeting(cleanMessage) || isMenuRequest(cleanMessage)) {
    return {
      answer: getMainMenu(),
      sources: []
    };
  }

  const convertedMessage = convertMenuToQuestion(cleanMessage);
  const search = searchRelevantDocuments(convertedMessage);

  if (!search.results.length) {
    return {
      answer: chatbotConfig.fallbackMessage.trim(),
      sources: []
    };
  }

  const topResults = search.results;

  const context = topResults
    .map((item, index) => {
      return `Data ${index + 1}
Sumber: ${item.source.title}
Jenis: ${item.type}
Isi:
${item.content}`;
    })
    .join("\n\n====================\n\n");

  const mainSource = topResults[0].source;

  const aiAnswer = await askGroq(cleanMessage, context, mainSource.title);

  const uniqueSources = [];
  const usedFileNames = new Set();

  topResults.forEach((item) => {
    if (!usedFileNames.has(item.fileName)) {
      usedFileNames.add(item.fileName);
      uniqueSources.push({
        title: item.source.title,
        link: item.source.link
      });
    }
  });

  let finalAnswer = aiAnswer;

  if (uniqueSources.length > 0) {
    finalAnswer += "\n\n📌 Sumber dokumen:";

    uniqueSources.forEach((source, index) => {
      finalAnswer += `\n${index + 1}. ${source.title}`;

      if (source.link && !source.link.includes("ISI_LINK")) {
        finalAnswer += `\n   Download: ${source.link}`;
      }
    });
  }

  finalAnswer +=
    '\n\nKamu bisa bertanya lagi dengan lebih spesifik, atau ketik "menu" untuk melihat pilihan informasi lainnya.';

  return {
    answer: finalAnswer,
    sources: uniqueSources
  };
}

module.exports = {
  processChat
};