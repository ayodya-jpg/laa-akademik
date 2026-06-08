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

function normalizeChatText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isGreeting(message) {
  const text = normalizeChatText(message);

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

  return greetings.some((word) => text === word || text.startsWith(word + " "));
}

function isMenuRequest(message) {
  const text = normalizeChatText(message);

  return [
    "menu",
    "help",
    "bantuan",
    "mulai",
    "fitur",
    "start",
    "layanan",
    "pilihan"
  ].some((word) => text === word || text.includes(word));
}

function getMainMenu() {
  const menuText = chatbotConfig.menus
    .map((menu) => `${menu.number}. ${menu.label}`)
    .join("\n");

  return `Halo! 👋 Aku ${chatbotConfig.botName}.

Aku bisa bantu kamu mencari informasi akademik berdasarkan data yang tersedia.

Silakan pilih menu berikut:

${menuText}

Kamu juga bisa langsung tanya dengan bahasa bebas, misalnya:
- kapan registrasi semester genap?
- maksimal SKS kalau IPS di atas 3 berapa?
- bagaimana cara daftar sidang TA?
- apa saja berkas sidang TA?
- kapan yudisium?
- NIP Dosen

Hanya admin yang dapat mengubah data`;
}

function convertMenuToQuestion(message) {
  const text = normalizeChatText(message);

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
        "Format update-nya belum sesuai ya.\n\nContoh yang benar:\n- update pendaftaran TA jadi 17 Januari 2026\n- ubah NIP dosen Alifiansyah menjadi 22960063",
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
    answer: `Aku mendeteksi perintah update data.

Detail update:
- Topik: ${parsed.topic}
- Nilai baru: ${parsed.value}

Silakan masukkan PIN admin untuk melanjutkan update.

Catatan: PIN berlaku selama 2 menit. Kalau lewat dari itu, update akan otomatis dibatalkan.`,
    sources: []
  };
}

function handleResetCommand(message) {
  const parsed = parseResetCommand(message);

  if (!parsed) {
    return {
      answer:
        "Format reset-nya belum sesuai ya.\n\nContoh yang benar:\n- reset update pendaftaran TA\n- reset update NIP dosen Alifiansyah\n- reset semua update",
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
    answer: `Aku mendeteksi perintah reset data update.

Detail reset:
- Jenis reset: ${parsed.type === "all" ? "Reset semua update" : "Reset berdasarkan topik"}
- Topik: ${parsed.topic}

Silakan masukkan PIN admin untuk melanjutkan reset.

Catatan: PIN berlaku selama 2 menit. Kalau lewat dari itu, reset akan otomatis dibatalkan.`,
    sources: []
  };
}

async function handleAdminPin(message) {
  if (!pendingAdminAction) {
    return null;
  }

  if (isPendingActionExpired()) {
    clearPendingAction();

    return {
      answer:
        "Waktu input PIN sudah habis, jadi perintah admin aku batalkan ya.\n\nSilakan ulangi perintah update atau reset kalau masih ingin melanjutkan.",
      sources: []
    };
  }

  const inputPin = String(message || "").trim();
  const adminPin = String(process.env.ADMIN_PIN || "").trim();

  if (!adminPin) {
    clearPendingAction();

    return {
      answer:
        "PIN admin belum diatur di environment variable.\n\nTambahkan ADMIN_PIN di file .env untuk lokal atau di Environment Variables untuk Vercel.",
      sources: []
    };
  }

  if (inputPin !== adminPin) {
    clearPendingAction();

    return {
      answer:
        "PIN yang dimasukkan belum sesuai. Perintah admin aku batalkan ya.\n\nSilakan ulangi perintah update atau reset kalau ingin mencoba lagi.",
      sources: []
    };
  }

  try {
    let result;

    if (pendingAdminAction.type === "update") {
      result = await createUpdate(pendingAdminAction.originalMessage);
    } else if (pendingAdminAction.type === "reset") {
      result = await resetUpdates(pendingAdminAction.originalMessage);
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
  } catch (error) {
    console.error("Admin PIN Action Error:", error);

    clearPendingAction();

    return {
      answer:
        "PIN admin sudah benar, tetapi terjadi kendala saat menyimpan update.\n\nKemungkinan penyebabnya adalah koneksi ke Google Drive API gagal, environment variable Google Drive belum lengkap, atau folder Drive belum dibagikan ke service account.",
      sources: []
    };
  }
}

async function processChat(message) {
  const cleanMessage = String(message || "").trim();

  if (!cleanMessage) {
    return {
      answer: "Pesannya masih kosong nih. Coba tulis pertanyaan kamu dulu ya 😊",
      sources: []
    };
  }

  const pendingPinResponse = await handleAdminPin(cleanMessage);

  if (pendingPinResponse) {
    return pendingPinResponse;
  }

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
  const search = await searchRelevantDocuments(convertedMessage);

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
    '\n\nKamu bisa tanya lagi dengan lebih spesifik, atau ketik "menu" untuk melihat pilihan informasi lainnya.';

  return {
    answer: finalAnswer,
    sources: uniqueSources
  };
}

module.exports = {
  processChat
};