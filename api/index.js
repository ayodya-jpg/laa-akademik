const express = require("express");
const cors = require("cors");
const path = require("path");

const { loadDocuments, getAllDocumentsInfo } = require("../src/documentService");
const { processChat } = require("../src/chatService");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

let isLoaded = false;

async function ensureDocumentsLoaded() {
  if (!isLoaded) {
    await loadDocuments();
    isLoaded = true;
  }
}

app.get("/api/status", async (req, res) => {
  await ensureDocumentsLoaded();

  res.json({
    success: true,
    message: "LAA Akademik Bot aktif.",
    documents: getAllDocumentsInfo()
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    await ensureDocumentsLoaded();

    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        answer: "Pesan tidak boleh kosong ya 😊"
      });
    }

    const result = await processChat(message);

    res.json({
      success: true,
      bot: process.env.BOT_NAME || "LAA Akademik Bot",
      answer: result.answer,
      sources: result.sources
    });
  } catch (error) {
    console.error("Chat Error:", error);

    res.status(500).json({
      success: false,
      answer: "Maaf, sedang terjadi kendala saat memproses pertanyaan."
    });
  }
});

module.exports = app;