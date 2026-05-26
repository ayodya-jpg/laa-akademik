const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { loadDocuments, getAllDocumentsInfo } = require("./documentService");
const { processChat } = require("./chatService");

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_NAME = process.env.BOT_NAME || "LAA Akademik Bot";

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: `${BOT_NAME} aktif dan server berjalan.`,
    documents: getAllDocumentsInfo()
  });
});

app.post("/api/chat", async (req, res) => {
  try {
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
      bot: BOT_NAME,
      answer: result.answer,
      sources: result.sources
    });
  } catch (error) {
    console.error("Chat Error:", error);

    res.status(500).json({
      success: false,
      answer:
        "Maaf, sedang terjadi kendala saat memproses pertanyaan. Coba ulangi beberapa saat lagi ya."
    });
  }
});

loadDocuments()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
      console.log("Dataset berhasil dimuat dan chatbot siap digunakan.");
    });
  })
  .catch((error) => {
    console.error("Gagal memuat dataset:", error);
  });