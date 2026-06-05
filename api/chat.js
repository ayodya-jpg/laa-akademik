const { loadDocuments } = require("../src/documentService");
const { processChat } = require("../src/chatService");

let isLoaded = false;

async function ensureLoaded() {
  if (!isLoaded) {
    await loadDocuments();
    isLoaded = true;
  }
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        answer: "Method tidak diizinkan."
      });
    }

    await ensureLoaded();

    const { message } = req.body || {};

    if (!message || String(message).trim() === "") {
      return res.status(400).json({
        success: false,
        answer: "Pesan tidak boleh kosong ya 😊"
      });
    }

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
        "Maaf, sedang terjadi kendala saat memproses pertanyaan. Coba ulangi beberapa saat lagi ya."
    });
  }
};