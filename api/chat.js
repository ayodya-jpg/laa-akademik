const { loadDocuments } = require("../src/documentService");
const { processChat } = require("../src/chatService");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        answer: "Method tidak diizinkan. Gunakan POST."
      });
    }

    const { message } = req.body || {};

    if (!message || String(message).trim() === "") {
      return res.status(400).json({
        success: false,
        answer: "Pesan tidak boleh kosong ya 😊"
      });
    }

    console.log("CHAT MESSAGE:", message);

    await loadDocuments();

    const result = await processChat(message);

    return res.status(200).json({
      success: true,
      bot: process.env.BOT_NAME || "LAA Akademik Bot",
      answer: result.answer,
      sources: result.sources || []
    });
  } catch (error) {
    console.error("Vercel Chat Error:", error);

    return res.status(500).json({
      success: false,
      answer:
        "Maaf, sedang terjadi kendala saat memproses pertanyaan. Coba ulangi beberapa saat lagi ya.",
      error: error.message,
      stack: error.stack
    });
  }
};