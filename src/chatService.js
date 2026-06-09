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
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/gi, " ")
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

function isUpdateResult(item) {
  return (
    item.fileName === "knowledge-updates.json" ||
    item.type === "database" ||
    item.intent === "update" ||
    item.source?.title === "Database Update Chatbot"
  );
}

function orderResultsByPriority(results = []) {
  const updateResults = results.filter((item) => isUpdateResult(item));
  const normalResults = results.filter((item) => !isUpdateResult(item));

  return [...updateResults, ...normalResults];
}

function buildContext(results = []) {
  return results
    .map((item, index) => {
      const priorityNote = isUpdateResult(item)
        ? `CATATAN PRIORITAS:
Ini adalah data update terbaru dari admin. Jika data ini bertentangan dengan dokumen lain, Excel, atau PDF, maka data update admin ini wajib digunakan sebagai jawaban utama. Jangan gunakan nilai lama dari dokumen lain untuk topik yang sama.`
        : "Data pendukung dari dokumen akademik.";

      return `Data ${index + 1}
Sumber: ${item.source.title}
Jenis: ${item.type}
Prioritas:
${priorityNote}

Isi:
${item.content}`;
    })
    .join("\n\n====================\n\n");
}

function buildUniqueSources(results = []) {
  const uniqueSources = [];
  const usedFileNames = new Set();

  results.forEach((item) => {
    if (!usedFileNames.has(item.fileName)) {
      usedFileNames.add(item.fileName);
      uniqueSources.push({
        title: item.source.title,
        link: item.source.link
      });
    }
  });

  return uniqueSources;
}

function appendSources(answer, sources = []) {
  if (!sources.length) {
    return answer;
  }

  let finalAnswer = answer;

  finalAnswer += "\n\n📌 Sumber dokumen:";

  sources.forEach((source, index) => {
    finalAnswer += `\n${index + 1}. ${source.title}`;

    if (source.link && !source.link.includes("ISI_LINK")) {
      finalAnswer += `\n   Download: ${source.link}`;
    }
  });

  return finalAnswer;
}

/* ======================================================
   DIRECT UPDATE ANSWER
   Dipakai untuk data update umum seperti jadwal, tanggal,
   registrasi, PRS, TA, dan sebagainya.
   Khusus data dosen/NIP tidak boleh langsung dijawab dari sini,
   supaya format lengkap Data Dosen 2026 tetap dipakai.
====================================================== */

function extractUpdateData(updateContext) {
  const text = String(updateContext || "");

  const topicMatch =
    text.match(/Topik:\s*([^\n]+)/i) ||
    text.match(/topik\s*[:=]\s*([^\n]+)/i);

  const valueMatch =
    text.match(/Nilai terbaru:\s*([^\n]+)/i) ||
    text.match(/Nilai baru:\s*([^\n]+)/i) ||
    text.match(/nilai\s*baru\s*[:=]\s*([^\n]+)/i) ||
    text.match(/menjadi\s+([^\n]+)/i) ||
    text.match(/jadi\s+([^\n]+)/i);

  const topic = topicMatch ? topicMatch[1].trim() : "";
  const value = valueMatch ? valueMatch[1].trim() : "";

  return {
    topic,
    value,
    raw: text
  };
}

function buildDirectUpdateAnswer(question, updateContext) {
  const normalizedQuestion = normalizeChatText(question);
  const updateData = extractUpdateData(updateContext);

  const topic = updateData.topic || normalizedQuestion;
  const value = updateData.value;

  if (!updateContext || !String(updateContext).trim()) {
    return null;
  }

  if (value) {
    return `Data terbaru dari admin untuk ${topic} adalah ${value}.`;
  }

  return `Data terbaru dari admin yang tersedia adalah:

${String(updateContext).trim()}`;
}

function isLecturerQuestionForDirectUpdate(question) {
  const text = normalizeChatText(question);

  return (
    text.includes("nip") ||
    text.includes("nidn") ||
    text.includes("dosen") ||
    text.includes("kode dosen") ||
    text.includes("nama gelar")
  );
}

function shouldUseDirectUpdateAnswer(question, updateContext) {
  if (!updateContext) {
    return false;
  }

  /*
    Penting:
    Untuk pertanyaan dosen/NIP, jangan jawab langsung dari update admin.
    Kalau dijawab langsung, formatnya akan jadi:
    "Data terbaru dari admin menunjukkan..."
    Padahal yang diinginkan adalah format lengkap Data Dosen 2026.
  */
  if (isLecturerQuestionForDirectUpdate(question)) {
    return false;
  }

  const normalizedQuestion = normalizeChatText(question);
  const normalizedUpdate = normalizeChatText(updateContext);

  const importantKeywords = [
    "pendaftaran",
    "tanggal",
    "jadwal",
    "ta",
    "sidang",
    "prs",
    "registrasi",
    "yudisium",
    "wisuda",
    "krs",
    "mbkm",
    "kerja praktik",
    "kp",
    "magang"
  ];

  const hasImportantKeyword = importantKeywords.some((keyword) =>
    normalizedQuestion.includes(keyword)
  );

  const questionTokens = normalizedQuestion
    .split(" ")
    .filter((word) => word.length > 2);

  const matchedTokenCount = questionTokens.filter((token) =>
    normalizedUpdate.includes(token)
  ).length;

  return hasImportantKeyword || matchedTokenCount >= 1;
}

/* ======================================================
   FORMAT KHUSUS DATA DOSEN
   Ambil data lengkap dari Data Dosen 2026,
   lalu timpa field tertentu dengan update admin.
====================================================== */

function isLecturerQuestion(message) {
  const text = normalizeChatText(message);

  return (
    text.includes("dosen") ||
    text.includes("nip") ||
    text.includes("nip ypt") ||
    text.includes("nidn") ||
    text.includes("kode dosen") ||
    text.includes("nama gelar")
  );
}

function getQuestionNameTokens(message) {
  return normalizeChatText(message)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "nip",
          "nip ypt",
          "nidn",
          "dosen",
          "kode",
          "data",
          "info",
          "informasi",
          "berapa",
          "nama",
          "gelar",
          "status",
          "prodi",
          "program",
          "studi"
        ].includes(token)
    );
}

function extractUpdateBlocksFromContext(context) {
  const text = String(context || "");

  const blocks = text
    .split(/Update terbaru\s+\d+/i)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const topicMatch = block.match(/Topik:\s*([^\n]+)/i);
      const valueMatch =
        block.match(/Nilai terbaru:\s*([^\n]+)/i) ||
        block.match(/Nilai baru:\s*([^\n]+)/i) ||
        block.match(/Nilai:\s*([^\n]+)/i);
      const originalMatch = block.match(/Perintah asli:\s*([^\n]+)/i);

      return {
        topic: topicMatch ? topicMatch[1].trim() : "",
        value: valueMatch ? valueMatch[1].trim() : "",
        original: originalMatch ? originalMatch[1].trim() : ""
      };
    })
    .filter((item) => item.topic || item.value || item.original);
}

function extractLecturerLinesFromContext(context) {
  const text = String(context || "");

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = normalizeChatText(line);

      return (
        lower.includes("nip ypt") ||
        lower.includes("kode dosen baru") ||
        lower.includes("nama gelar") ||
        lower.includes("status aktif") ||
        lower.includes("prodi")
      );
    });
}

function extractLecturerDataFromLine(line) {
  const text = String(line || "");

  const nameMatch = text.match(/NAMA:\s*([^;\n]+)/i);
  const statusMatch = text.match(/Status Aktif:\s*([^;\n]+)/i);
  const prodiMatch = text.match(/PRODI:\s*([^;\n]+)/i);
  const nipMatch = text.match(/NIP YPT:\s*([^;\n]+)/i);
  const gelarMatch = text.match(/Nama Gelar:\s*([^;\n]+)/i);
  const kodeMatch = text.match(/Kode Dosen Baru:\s*([^;\n]+)/i);

  if (!nameMatch && !nipMatch && !gelarMatch && !kodeMatch) {
    return null;
  }

  return {
    nama: nameMatch ? nameMatch[1].trim() : "",
    status: statusMatch ? statusMatch[1].trim() : "",
    prodi: prodiMatch ? prodiMatch[1].trim() : "",
    nip: nipMatch ? nipMatch[1].trim() : "",
    gelar: gelarMatch ? gelarMatch[1].trim() : "",
    kode: kodeMatch ? kodeMatch[1].trim() : ""
  };
}

function findBestLecturerData(context, message) {
  const lines = extractLecturerLinesFromContext(context);

  if (!lines.length) {
    return null;
  }

  const nameTokens = getQuestionNameTokens(message);

  const matchedLine =
    lines.find((line) => {
      const lowerLine = normalizeChatText(line);

      return nameTokens.some((token) => lowerLine.includes(token));
    }) || lines[0];

  return extractLecturerDataFromLine(matchedLine);
}

function applyAdminUpdateToLecturer(lecturer, context, message) {
  if (!lecturer) {
    return null;
  }

  const updates = extractUpdateBlocksFromContext(context);
  const nameTokens = getQuestionNameTokens(message);
  const updatedLecturer = { ...lecturer };

  updates.forEach((update) => {
    const combined = normalizeChatText(
      `${update.topic} ${update.original}`
    );

    const samePerson =
      nameTokens.length === 0 ||
      nameTokens.some((token) => combined.includes(token));

    if (!samePerson || !update.value) {
      return;
    }

    if (combined.includes("nip") || combined.includes("nidn")) {
      updatedLecturer.nip = update.value;
    }

    if (combined.includes("kode dosen")) {
      updatedLecturer.kode = update.value;
    }

    if (combined.includes("status")) {
      updatedLecturer.status = update.value;
    }

    if (combined.includes("prodi") || combined.includes("program studi")) {
      updatedLecturer.prodi = update.value;
    }

    if (combined.includes("gelar") || combined.includes("nama gelar")) {
      updatedLecturer.gelar = update.value;
    }
  });

  return updatedLecturer;
}

function buildLecturerAnswerFromContext(message, context) {
  if (!isLecturerQuestion(message)) {
    return null;
  }

  const lecturer = findBestLecturerData(context, message);

  if (!lecturer) {
    return null;
  }

  const updatedLecturer = applyAdminUpdateToLecturer(
    lecturer,
    context,
    message
  );

  let answer = "Informasi dosen yang tersedia adalah:\n\n";

  if (updatedLecturer.nama) {
    answer += `- Nama: ${updatedLecturer.nama}\n`;
  }

  if (updatedLecturer.status) {
    answer += `- Status Aktif: ${updatedLecturer.status}\n`;
  }

  if (updatedLecturer.prodi) {
    answer += `- Prodi: ${updatedLecturer.prodi}\n`;
  }

  if (updatedLecturer.nip) {
    answer += `- NIP YPT: ${updatedLecturer.nip}\n`;
  }

  if (updatedLecturer.gelar) {
    answer += `- Nama Gelar: ${updatedLecturer.gelar}\n`;
  }

  if (updatedLecturer.kode) {
    answer += `- Kode Dosen Baru: ${updatedLecturer.kode}\n`;
  }

  return answer.trim();
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

  /*
    Direct update tetap dipakai untuk data umum,
    tetapi tidak dipakai untuk dosen/NIP.
  */
  const directUpdateContext =
    typeof require("./updateService").buildUpdateContext === "function"
      ? await require("./updateService").buildUpdateContext(convertedMessage)
      : "";

  if (shouldUseDirectUpdateAnswer(cleanMessage, directUpdateContext)) {
    const directAnswer = buildDirectUpdateAnswer(cleanMessage, directUpdateContext);

    if (directAnswer) {
      return {
        answer:
          `${directAnswer}

Kamu bisa tanya lagi dengan lebih spesifik, atau ketik "menu" untuk melihat pilihan informasi lainnya.`,
        sources: [
          {
            title: "Database Update Chatbot",
            link: ""
          }
        ]
      };
    }
  }

  const search = await searchRelevantDocuments(convertedMessage);

  if (!search.results.length) {
    return {
      answer: chatbotConfig.fallbackMessage.trim(),
      sources: []
    };
  }

  const orderedResults = orderResultsByPriority(search.results);

  const context = buildContext(orderedResults);
  const mainSource = orderedResults[0].source;

  let aiAnswer;

  const lecturerAnswer = buildLecturerAnswerFromContext(
    cleanMessage,
    context
  );

  if (lecturerAnswer) {
    aiAnswer = lecturerAnswer;
  } else {
    aiAnswer = await askGroq(cleanMessage, context, mainSource.title);
  }

  const uniqueSources = buildUniqueSources(orderedResults);

  let finalAnswer = appendSources(aiAnswer, uniqueSources);

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