const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function buildFallbackAnswer(question, context, sourceTitle) {
  const shortContext = String(context || "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 1800);

  return `Saya menemukan informasi yang kemungkinan relevan dari ${sourceTitle}, tetapi saat ini layanan AI sedang terkena batas penggunaan token Groq.

Berikut ringkasan data yang tersedia dari dataset:

${shortContext}

Silakan coba ulang beberapa saat lagi agar jawaban bisa diringkas lebih natural oleh AI.`;
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

  const trimmedContext = String(context || "").slice(0, 3500);

  const prompt = `
Kamu adalah LAA Akademik Bot, chatbot layanan administrasi akademik Telkom University Surabaya.

Tugasmu:
1. Jawab pertanyaan user hanya berdasarkan konteks data yang diberikan.
2. Jangan mengarang informasi di luar konteks.
3. Jika data tidak cukup, jelaskan bahwa informasi belum tersedia atau belum cukup jelas pada dataset.
4. Gunakan bahasa Indonesia yang ramah, natural, dan mudah dipahami mahasiswa.
5. Jika konteks berasal dari jadwal kuliah, rangkum dengan format rapi: hari, jam, mata kuliah, kelas, ruang, dan dosen jika tersedia.
6. Jika konteks berasal dari kalender akademik, sebutkan nama kegiatan dan tanggal/periode yang relevan.
7. Jika konteks berasal dari pedoman akademik, jelaskan aturan dengan singkat.
8. Jika konteks berasal dari panduan sidang TA, jelaskan alur, syarat, atau berkas secara runtut.
9. Jangan menyebut istilah teknis seperti chunk, konteks 1, dataset mentah, atau retrieval.

Pertanyaan user:
${question}

Konteks data:
${trimmedContext}

Sumber utama:
${sourceTitle}
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah chatbot akademik yang ramah, hemat kata, teliti, dan hanya menjawab berdasarkan dataset."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 450
    });

    return (
      completion.choices[0]?.message?.content ||
      "Maaf, saya belum dapat membuat jawaban dari data yang tersedia."
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      return buildFallbackAnswer(question, trimmedContext, sourceTitle);
    }

    console.error("Groq Error:", error?.error || error?.message || error);

    return buildFallbackAnswer(question, trimmedContext, sourceTitle);
  }
}

module.exports = {
  askGroq
};