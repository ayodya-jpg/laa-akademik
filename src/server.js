const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const { loadDocuments, getAllDocumentsInfo } = require("./documentService");
const { processChat } = require("./chatService");
const {
  addUploadedDocument,
  deleteUploadedDocument,
  getUploadsDir
} = require("./uploadDocumentService");

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_NAME = process.env.BOT_NAME || "LAA Akademik Bot";

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "../public")));

const uploadDir = getUploadsDir();

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);

    cb(null, `${Date.now()}-${baseName || "dokumen"}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];

    const allowedExtensions = [".pdf", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedMimeTypes.includes(file.mimetype) && !allowedExtensions.includes(ext)) {
      return cb(new Error("File harus berformat PDF, XLSX, atau XLS."));
    }

    cb(null, true);
  }
});

function isValidAdminPin(inputPin) {
  const adminPin = String(process.env.ADMIN_PIN || "").trim();
  const pin = String(inputPin || "").trim();

  return Boolean(adminPin) && pin === adminPin;
}

function getDocumentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".pdf") return "pdf";
  if ([".xlsx", ".xls"].includes(ext)) return "excel";

  return "unknown";
}

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

app.post("/api/admin/documents/upload", upload.single("document"), async (req, res) => {
  try {
    if (!isValidAdminPin(req.body.pin)) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(401).json({
        success: false,
        message: "PIN admin tidak sesuai. Dokumen tidak disimpan."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File dokumen belum dipilih."
      });
    }

    const type = getDocumentType(req.file.originalname);

    if (type === "unknown") {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(400).json({
        success: false,
        message: "Format dokumen tidak didukung. Gunakan PDF, XLSX, atau XLS."
      });
    }

    const keywords = String(req.body.keywords || "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    const metadata = addUploadedDocument({
      fileName: req.file.filename,
      originalName: req.file.originalname,
      title: req.body.title || req.file.originalname,
      intent: req.body.intent || "umum",
      type,
      category: req.body.category || "Dokumen Akademik",
      link: req.body.link || "",
      keywords
    });

    await loadDocuments();

    res.json({
      success: true,
      message: "Dokumen berhasil di-upload dan knowledge base sudah diperbarui.",
      document: metadata,
      documents: getAllDocumentsInfo()
    });
  } catch (error) {
    console.error("Upload Document Error:", error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || "Gagal meng-upload dokumen."
    });
  }
});

app.delete("/api/admin/documents/:fileName", async (req, res) => {
  try {
    if (!isValidAdminPin(req.query.pin)) {
      return res.status(401).json({
        success: false,
        message: "PIN admin tidak sesuai."
      });
    }

    const deleted = deleteUploadedDocument(req.params.fileName);

    await loadDocuments();

    res.json({
      success: true,
      message: deleted ? "Dokumen berhasil dihapus." : "Dokumen tidak ditemukan.",
      documents: getAllDocumentsInfo()
    });
  } catch (error) {
    console.error("Delete Document Error:", error);

    res.status(500).json({
      success: false,
      message: "Gagal menghapus dokumen."
    });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Ukuran file terlalu besar. Maksimal 10 MB."
          : error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Terjadi kesalahan pada request."
    });
  }

  next();
});

loadDocuments()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
      console.log("Dataset berhasil dimuat dan chatbot siap digunakan.");
    });
  })
  .catch(() => {
    console.error("Gagal memuat dataset.");
  });