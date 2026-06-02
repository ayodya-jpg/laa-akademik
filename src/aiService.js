const Groq = require("groq-sdk");
const chatbotConfig = require("./config/chatbotConfig");
const { getQuestionType } = require("./textHelper");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function buildFallbackAnswer(question, context, sourceTitle) {
  const shortContext = String(context || "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 1800);

  return `Aku menemukan informasi yang kemungkinan relevan dari ${sourceTitle}, tetapi saat ini layanan AI belum bisa merangkum jawaban secara penuh.

Berikut informasi yang ditemukan:

${shortContext}

Kalau informasi ini belum cukup jelas, kamu bisa menghubungi Customer Service LAA Akademik melalui WhatsApp.`;
}

function isRateLimitError(error) {
  const message =
    error?.error?.error?.message ||
    error?.error?.message ||
    error?.message ||
    "";

  return (
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("rate_limit_exceeded") ||
    message.toLowerCase().includes("tokens per day")
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
  if (
    !process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY === "isi_api_key_groq_kamu"
  ) {
    return buildFallbackAnswer(question, context, sourceTitle);
  }

  const trimmedContext = String(context || "").slice(
    0,
    chatbotConfig.groq.contextLimit
  );

  const rulesText = chatbotConfig.rules.map((rule) => `- ${rule}`).join("\n");
  const answerStyle = getAnswerStyleInstruction(question);

  const correctionInstruction = options.isCorrection
    ? `
Catatan percakapan:
User sedang mengoreksi jawaban sebelumnya. Akui dengan sopan bahwa jawaban sebelumnya mungkin belum sesuai, lalu jawab ulang berdasarkan konteks dokumen yang sekarang tersedia.
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
      "Maaf, aku belum bisa membuat jawaban dari data yang tersedia."
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      return buildFallbackAnswer(question, trimmedContext, sourceTitle);
    }

    return buildFallbackAnswer(question, trimmedContext, sourceTitle);
  }
}

module.exports = {
  askGroq
};