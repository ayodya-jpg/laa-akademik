const Groq = require("groq-sdk");
const chatbotConfig = require("./config/chatbotConfig");
const { getQuestionType } = require("./textHelper");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function cleanText(text) {
  return String(text || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSimpleText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   LECTURER DATA FORMAT
========================= */

function extractLecturerData(context) {
  const text = String(context || "");

  const nameMatch = text.match(/NAMA:\s*([^;]+)/i);
  const statusMatch = text.match(/Status Aktif:\s*([^;]+)/i);
  const prodiMatch = text.match(/PRODI:\s*([^;]+)/i);
  const nipMatch = text.match(/NIP YPT:\s*([^;]+)/i);
  const gelarMatch = text.match(/Nama Gelar:\s*([^;]+)/i);
  const kodeMatch = text.match(/Kode Dosen Baru:\s*([^;\n]+)/i);

  if (!nameMatch && !nipMatch && !gelarMatch) {
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

function extractUpdateBlocks(context) {
  const text = String(context || "");

  const blocks = text
    .split(/Update terbaru\s+\d+/i)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const topicMatch = block.match(/Topik:\s*([^\n]+)/i);
      const valueMatch = block.match(/Nilai terbaru:\s*([^\n]+)/i);
      const dateMatch = block.match(/Tanggal update:\s*([^\n]+)/i);
      const originalMatch = block.match(/Perintah asli:\s*([^\n]+)/i);

      return {
        topic: topicMatch ? topicMatch[1].trim() : "",
        value: valueMatch ? valueMatch[1].trim() : "",
        date: dateMatch ? dateMatch[1].trim() : "",
        original: originalMatch ? originalMatch[1].trim() : ""
      };
    })
    .filter((item) => item.topic || item.value || item.original);
}

function getLatestUpdateValue(context, fieldKeywords = []) {
  const updates = extractUpdateBlocks(context);

  if (!updates.length) {
    return "";
  }

  const normalizedKeywords = fieldKeywords.map((item) =>
    normalizeSimpleText(item)
  );

  const matchedUpdate = updates.find((item) => {
    const combined = normalizeSimpleText(
      `${item.topic} ${item.value} ${item.original}`
    );

    return normalizedKeywords.some((keyword) => combined.includes(keyword));
  });

  return matchedUpdate ? matchedUpdate.value : "";
}

function applyLecturerUpdates(lecturer, context) {
  if (!lecturer) {
    return null;
  }

  const updatedLecturer = { ...lecturer };

  const updatedNip = getLatestUpdateValue(context, [
    "nip",
    "nip ypt",
    "nip dosen"
  ]);

  const updatedKodeDosen = getLatestUpdateValue(context, [
    "kode dosen",
    "kode dosen baru"
  ]);

  const updatedStatus = getLatestUpdateValue(context, [
    "status aktif",
    "status dosen"
  ]);

  const updatedProdi = getLatestUpdateValue(context, [
    "prodi",
    "program studi"
  ]);

  const updatedNamaGelar = getLatestUpdateValue(context, [
    "nama gelar",
    "gelar"
  ]);

  if (updatedNip) {
    updatedLecturer.nip = updatedNip;
  }

  if (updatedKodeDosen) {
    updatedLecturer.kode = updatedKodeDosen;
  }

  if (updatedStatus) {
    updatedLecturer.status = updatedStatus;
  }

  if (updatedProdi) {
    updatedLecturer.prodi = updatedProdi;
  }

  if (updatedNamaGelar) {
    updatedLecturer.gelar = updatedNamaGelar;
  }

  return updatedLecturer;
}

function buildLecturerFallbackAnswer(context) {
  const lecturer = extractLecturerData(context);

  if (!lecturer) {
    return null;
  }

  const updatedLecturer = applyLecturerUpdates(lecturer, context);

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

function isLecturerQuestion(question) {
  const questionType = getQuestionType(question);
  const normalizedQuestion = normalizeSimpleText(question);

  return (
    questionType === "lecturer" ||
    normalizedQuestion.includes("dosen") ||
    normalizedQuestion.includes("nip") ||
    normalizedQuestion.includes("nip ypt") ||
    normalizedQuestion.includes("kode dosen")
  );
}

/* =========================
   PROCEDURE FORMAT
========================= */

function buildProcedureFallbackAnswer(context, sourceTitle) {
  const cleanContext = cleanText(context);

  const lines = cleanContext
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Data "))
    .filter((line) => !line.startsWith("Sumber:"))
    .filter((line) => !line.startsWith("Jenis:"))
    .filter((line) => !line.startsWith("Isi:"))
    .filter((line) => !line.includes("===================="))
    .slice(0, 12);

  if (!lines.length) {
    return null;
  }

  let answer = `Informasi yang tersedia dari ${sourceTitle} adalah:\n\n`;

  lines.forEach((line, index) => {
    answer += `${index + 1}. ${line}\n`;
  });

  return answer.trim();
}

function buildFallbackAnswer(question, context, sourceTitle) {
  const questionType = getQuestionType(question);
  const normalizedQuestion = normalizeSimpleText(question);

  if (isLecturerQuestion(question)) {
    const lecturerAnswer = buildLecturerFallbackAnswer(context);

    if (lecturerAnswer) {
      return lecturerAnswer;
    }
  }

  if (
    questionType === "procedure" ||
    normalizedQuestion.includes("cara") ||
    normalizedQuestion.includes("alur") ||
    normalizedQuestion.includes("prosedur")
  ) {
    const procedureAnswer = buildProcedureFallbackAnswer(context, sourceTitle);

    if (procedureAnswer) {
      return procedureAnswer;
    }
  }

  const shortContext = cleanText(context).slice(0, 1400);

  return `Informasi yang tersedia dari ${sourceTitle} adalah:

${shortContext}

Jika informasi ini belum cukup jelas, kamu bisa menghubungi Customer Service LAA Akademik.`;
}

/* =========================
   GROQ HELPER
========================= */

function isRateLimitError(error) {
  const message =
    error?.error?.error?.message ||
    error?.error?.message ||
    error?.message ||
    "";

  return (
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("rate_limit_exceeded") ||
    message.toLowerCase().includes("tokens per day") ||
    message.toLowerCase().includes("tokens per minute")
  );
}

function getAnswerStyleInstruction(question) {
  const questionType = getQuestionType(question);

  const styles = {
    date: `
Jenis pertanyaan: tanggal atau periode.
Cara menjawab:
- Jawab langsung ke tanggal/periode yang diminta.
- Sebutkan nama kegiatan dan tanggal/periode.
- Jika ada catatan penting, tulis setelahnya secara singkat.
`,

    procedure: `
Jenis pertanyaan: prosedur atau cara.
Cara menjawab:
- Awali dengan kalimat singkat yang natural.
- Jelaskan dalam langkah-langkah bernomor.
- Jangan membuat jawaban terlalu panjang.
- Fokus pada alur yang benar dari dokumen.
`,

    requirement: `
Jenis pertanyaan: syarat, dokumen, atau berkas.
Cara menjawab:
- Awali dengan kalimat singkat.
- Gunakan bullet list untuk syarat/dokumen.
- Jika ada catatan, tulis di akhir.
`,

    lecturer: `
Jenis pertanyaan: data dosen.
Cara menjawab:
Gunakan format berikut jika datanya tersedia:

Informasi dosen yang tersedia adalah:

- Nama: ...
- Status Aktif: ...
- Prodi: ...
- NIP YPT: ...
- Nama Gelar: ...
- Kode Dosen Baru: ...

Aturan:
- Jangan membuat paragraf panjang untuk data dosen.
- Jika ada data dari Database Update Chatbot, gunakan sebagai data terbaru.
- Tampilkan hanya field yang tersedia.
`,

    academic_rule: `
Jenis pertanyaan: aturan akademik.
Cara menjawab:
- Jelaskan aturan utamanya dengan bahasa sederhana.
- Gunakan poin jika ada beberapa ketentuan.
- Hindari bahasa yang terlalu formal.
`,

    general: `
Jenis pertanyaan: umum.
Cara menjawab:
- Jawab secara natural, ramah, dan tetap berdasarkan data.
- Gunakan paragraf singkat atau poin jika diperlukan.
`
  };

  return styles[questionType] || styles.general;
}

async function askGroq(question, context, sourceTitle, options = {}) {
  const trimmedContext = String(context || "").slice(
    0,
    chatbotConfig.groq.contextLimit
  );

  /*
    Penting:
    Untuk data dosen, jawaban dibuat deterministic agar formatnya selalu sama.
    Jika ada update admin, value update akan menimpa data lama dari dokumen.
    Contoh:
    Data Dosen 2026: NIP 22960061
    Database Update Chatbot: NIP 22960064
    Output: tetap format data dosen, tetapi NIP menjadi 22960064.
  */
  if (isLecturerQuestion(question)) {
    const lecturerAnswer = buildLecturerFallbackAnswer(trimmedContext);

    if (lecturerAnswer) {
      return lecturerAnswer;
    }
  }

  if (
    !process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY === "isi_api_key_groq_kamu"
  ) {
    return buildFallbackAnswer(question, trimmedContext, sourceTitle);
  }

  const rulesText = chatbotConfig.rules.map((rule) => `- ${rule}`).join("\n");
  const answerStyle = getAnswerStyleInstruction(question);

  const correctionInstruction = options.isCorrection
    ? `
Catatan percakapan:
User sedang mengoreksi jawaban sebelumnya. Akui dengan sopan bahwa jawaban sebelumnya mungkin belum sesuai, lalu jawab ulang berdasarkan data yang sekarang tersedia.
`
    : "";

  const prompt = `
${chatbotConfig.persona}

Kamu menjawab sebagai chatbot layanan akademik kampus.

Gaya bahasa:
- Gunakan bahasa Indonesia yang ramah, natural, dan mudah dipahami mahasiswa.
- Boleh terdengar seperti petugas akademik yang sopan.
- Jangan terlalu kaku.
- Jangan terlalu panjang.
- Jangan mengulang pertanyaan user secara berlebihan.

Aturan utama:
${rulesText}

Aturan tambahan:
- Jawab hanya berdasarkan data yang diberikan.
- Jangan mengarang informasi di luar data.
- Jika data tidak memuat jawaban yang sesuai, sampaikan bahwa informasi tersebut belum tersedia di dokumen chatbot.
- Jangan menyebut istilah teknis seperti chunk, retrieval, scoring, prompt, atau konteks internal.
- Jangan membuka jawaban dengan kalimat “Berdasarkan konteks yang diberikan”.
- Jangan menyebut “dataset” kepada user.
- Jika user bertanya prosedur, gunakan langkah-langkah.
- Jika user bertanya syarat/dokumen, gunakan poin.
- Jika data dari Database Update Chatbot bertentangan dengan dokumen lain, prioritaskan Database Update Chatbot.
- Gunakan kata “kamu” agar lebih natural, tetapi tetap sopan.

${correctionInstruction}

${answerStyle}

Pertanyaan user:
${question}

Data yang tersedia:
${trimmedContext}

Sumber utama:
${sourceTitle}
`;

  try {
    const completion = await groq.chat.completions.create({
      model: chatbotConfig.groq.model,
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah LAA Akademik Bot. Jawabanmu natural, ramah, singkat, rapi, dan hanya berdasarkan data yang tersedia."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: chatbotConfig.groq.maxTokens
    });

    return (
      completion.choices[0]?.message?.content ||
      buildFallbackAnswer(question, trimmedContext, sourceTitle)
    );
  } catch (error) {
    console.error("Groq Error:", error.message);

    if (isRateLimitError(error)) {
      return buildFallbackAnswer(question, trimmedContext, sourceTitle);
    }

    return buildFallbackAnswer(question, trimmedContext, sourceTitle);
  }
}

module.exports = {
  askGroq
};