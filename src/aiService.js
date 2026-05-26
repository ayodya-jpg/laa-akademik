const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function askGroq(question, context, sourceTitle) {
  if (
    !process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY === "isi_api_key_groq_kamu"
  ) {
    return `Saya menemukan data yang kemungkinan relevan dari ${sourceTitle}:\n\n${context.slice(
      0,
      1200
    )}\n\nSilakan isi GROQ_API_KEY agar jawaban bisa diringkas menjadi lebih natural.`;
  }

  const prompt = `
Kamu adalah LAA Akademik Bot, chatbot layanan administrasi akademik Telkom University Surabaya.

Tugasmu:
1. Jawab pertanyaan user hanya berdasarkan konteks data yang diberikan.
2. Jangan mengarang informasi di luar konteks.
3. Jika data tidak cukup, jelaskan bahwa informasi belum tersedia atau belum cukup jelas pada dataset.
4. Gunakan bahasa Indonesia yang ramah, natural, dan seperti sedang membantu mahasiswa.
5. Jika konteks berasal dari jadwal kuliah, rangkum jadwal dengan format yang rapi: hari, jam, mata kuliah, kelas, ruang, dosen jika tersedia.
6. Jika konteks berasal dari kalender akademik, sebutkan nama kegiatan dan tanggal/periode yang relevan.
7. Jika konteks berasal dari pedoman akademik, jelaskan aturan dengan singkat dan jelas.
8. Jangan menyebut "konteks 1", "chunk", atau istilah teknis kepada user.

Pertanyaan user:
${question}

Konteks data:
${context}

Sumber utama:
${sourceTitle}
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "Kamu adalah chatbot akademik yang ramah, teliti, dan hanya menjawab berdasarkan dataset."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.1,
    max_tokens: 900
  });

  return completion.choices[0]?.message?.content || "Maaf, saya belum dapat membuat jawaban.";
}

module.exports = {
  askGroq
};