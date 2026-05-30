const Groq = require("groq-sdk");
const chatbotConfig = require("./config/chatbotConfig");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function buildFallbackAnswer(question, context, sourceTitle) {
  const shortContext = String(context || "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 1800);

  return `Saya menemukan informasi yang kemungkinan relevan dari ${sourceTitle}, tetapi saat ini layanan AI belum dapat merangkum jawaban secara penuh.

Berikut data yang tersedia dari sumber tersebut:

${shortContext}

Jika informasi ini belum cukup jelas, kamu dapat menghubungi Customer Service LAA Akademik melalui WhatsApp.`;
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

  const prompt = `
${chatbotConfig.persona}

Aturan menjawab:
${rulesText}

Aturan khusus format jawaban:
- Jika user menanyakan data dosen, jawab dengan format daftar poin seperti ini:
  "Informasi tentang [nama dosen] adalah sebagai berikut:"
  - Nama: ...
  - Status Aktif: ...
  - Prodi: ...
  - NIP YPT: ...
  - Nama Gelar: ...
  - Kode Dosen Baru: ...
- Jangan mengubah format data dosen menjadi paragraf panjang.
- Jika ada data dari "Database Update Chatbot", gunakan data tersebut sebagai data terbaru.
- Jika data update hanya mengubah satu field, misalnya NIP dosen, maka field lain tetap diambil dari data dosen yang tersedia.
- Jangan menulis kalimat seperti "Mahasiswa, saya dapat membantu..." ketika menjawab data dosen.
- Jangan menyebut bahwa data diperbarui pada tanggal tertentu, kecuali user memang menanyakan riwayat update.
- Jangan menambahkan informasi yang tidak ada di konteks.
- Jika nama lengkap dosen ditemukan, gunakan nama lengkap tersebut pada pembuka jawaban.
- Jika data tidak lengkap, tampilkan field yang tersedia saja.
- Setelah daftar poin, boleh tambahkan satu kalimat penutup singkat.

Pertanyaan user:
${question}

Konteks data:
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
            "Kamu adalah chatbot akademik yang ramah, teliti, konsisten dalam format jawaban, dan hanya menjawab berdasarkan dataset."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: chatbotConfig.groq.temperature,
      max_tokens: chatbotConfig.groq.maxTokens
    });

    return (
      completion.choices[0]?.message?.content ||
      "Maaf, saya belum dapat membuat jawaban dari data yang tersedia."
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