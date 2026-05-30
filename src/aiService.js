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

Berikut data yang ditemukan:

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
Jawablah langsung ke inti tanggal/periode yang diminta.
Format jawaban:
- Mulai dengan kalimat singkat yang natural.
- Sebutkan nama kegiatan dan tanggal/periode.
- Jika ada catatan penting, tulis setelahnya.
`,

    procedure: `
Jenis pertanyaan: prosedur atau cara melakukan sesuatu.
Jawablah dengan format langkah-langkah yang rapi.
Format jawaban:
- Awali dengan kalimat natural.
- Gunakan daftar bernomor jika ada urutan proses.
- Jangan terlalu panjang.
`,

    requirement: `
Jenis pertanyaan: syarat, dokumen, atau berkas.
Jawablah dengan daftar poin.
Format jawaban:
- Awali dengan kalimat singkat.
- Gunakan bullet list untuk syarat atau dokumen.
- Jika ada catatan, tulis di akhir.
`,

    lecturer: `
Jenis pertanyaan: data dosen.
Jawablah dengan format tetap berikut:

Informasi tentang [Nama Dosen] adalah sebagai berikut:

- Nama: ...
- Status Aktif: ...
- Prodi: ...
- NIP YPT: ...
- Nama Gelar: ...
- Kode Dosen Baru: ...

Aturan:
- Jangan membuat paragraf panjang untuk data dosen.
- Jika ada data dari Database Update Chatbot, gunakan sebagai data terbaru.
- Jika update hanya mengubah satu field, gabungkan dengan field lain dari Data Dosen 2026.
- Jangan menyebut tanggal update kecuali user bertanya riwayat update.
- Tampilkan hanya field yang tersedia.
`,

    academic_rule: `
Jenis pertanyaan: aturan akademik seperti SKS, IPS, IPK, nilai, atau masa studi.
Jawablah dengan bahasa sederhana.
Format jawaban:
- Jelaskan aturan utamanya.
- Gunakan poin jika ada beberapa ketentuan.
- Hindari bahasa terlalu formal.
`,

    general: `
Jenis pertanyaan: umum.
Jawablah secara natural, ramah, dan tetap berdasarkan data yang tersedia.
Gunakan paragraf singkat atau poin bila diperlukan.
`
  };

  return styles[questionType] || styles.general;
}

async function askGroq(question, context, sourceTitle) {
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

  const prompt = `
${chatbotConfig.persona}

Kamu sedang menjawab sebagai chatbot layanan akademik kampus.
Gunakan gaya bahasa yang ramah, natural, dan membantu mahasiswa.
Jawaban boleh terdengar seperti petugas akademik yang sopan, tetapi jangan terlalu kaku.

Aturan utama:
${rulesText}

Aturan penting:
- Jawab hanya berdasarkan konteks data yang diberikan.
- Jangan mengarang data di luar konteks.
- Jangan menyebut istilah teknis seperti chunk, retrieval, database mentah, prompt, atau konteks internal.
- Jika data tidak lengkap, katakan dengan halus bahwa informasi pada data belum lengkap.
- Jangan terlalu panjang. Jawab secukupnya sesuai pertanyaan user.
- Jika ada data dari "Database Update Chatbot", perlakukan sebagai informasi terbaru.
- Jika data update bertentangan dengan PDF atau Excel, prioritaskan Database Update Chatbot.
- Jangan membuka jawaban dengan kalimat seperti "Berdasarkan konteks yang diberikan".
- Jangan menyebut "saya menemukan pada dataset" kecuali memang perlu.
- Gunakan kata "kamu" agar terasa natural.
- Tetap sopan dan profesional.

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
      temperature: 0.25,
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