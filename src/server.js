const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const { loadDocuments, getAllDocumentsInfo } = require("./documentService");
const { processChat } = require("./chatService");

let googleDriveService = null;
let uploadDocumentService = null;

try {
  googleDriveService = require("./googleDriveService");
} catch (error) {
  console.warn("googleDriveService tidak ditemukan. Upload Google Drive akan nonaktif.");
}

try {
  uploadDocumentService = require("./uploadDocumentService");
} catch (error) {
  console.warn("uploadDocumentService tidak ditemukan. Fallback upload lokal akan nonaktif.");
}

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_NAME = process.env.BOT_NAME || "LAA Akademik Bot";

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
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
  const ext = path.extname(fileName || "").toLowerCase();

  if (ext === ".pdf") return "pdf";
  if ([".xlsx", ".xls"].includes(ext)) return "excel";

  return "unknown";
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(keywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasGoogleDriveEnv() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

function getLocalUploadedDocuments() {
  try {
    return getAllDocumentsInfo();
  } catch (error) {
    console.error("Get Local Documents Error:", error);
    return [];
  }
}

async function saveToLocalUpload(req) {
  if (!uploadDocumentService) {
    throw new Error("uploadDocumentService tidak tersedia.");
  }

  const uploadDir = uploadDocumentService.getUploadsDir();

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const baseName = path
    .basename(req.file.originalname, ext)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);

  const savedFileName = `${Date.now()}-${baseName || "dokumen"}${ext}`;
  const savedPath = path.join(uploadDir, savedFileName);

  fs.writeFileSync(savedPath, req.file.buffer);

  const type = getDocumentType(req.file.originalname);

  const metadata = uploadDocumentService.addUploadedDocument({
    fileName: savedFileName,
    originalName: req.file.originalname,
    title: req.body.title || req.file.originalname,
    intent: req.body.intent || "umum",
    type,
    category: req.body.category || "Dokumen Akademik",
    link: req.body.link || "",
    keywords: normalizeKeywords(req.body.keywords)
  });

  await loadDocuments();

  return metadata;
}

app.get("/api/status", (req, res) => {
  return res.json({
    success: true,
    message: `${BOT_NAME} aktif dan server berjalan.`,
    bot: BOT_NAME,
    documents: getLocalUploadedDocuments()
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || String(message).trim() === "") {
      return res.status(400).json({
        success: false,
        answer: "Pesan tidak boleh kosong ya 😊"
      });
    }

    const result = await processChat(message);

    return res.json({
      success: true,
      bot: BOT_NAME,
      answer: result.answer,
      sources: result.sources || []
    });
  } catch (error) {
    console.error("Chat Error:", error);

    return res.status(500).json({
      success: false,
      answer:
        "Maaf, sedang terjadi kendala saat memproses pertanyaan. Coba ulangi beberapa saat lagi ya.",
      error: error.message
    });
  }
});

app.get("/api/drive-documents", async (req, res) => {
  try {
    if (googleDriveService && hasGoogleDriveEnv()) {
      const driveDocuments = await googleDriveService.readDriveDocuments();

      return res.json({
        success: true,
        source: "google_drive",
        message: "Daftar dokumen Google Drive berhasil dimuat.",
        documents: Array.isArray(driveDocuments) ? driveDocuments : []
      });
    }

    const localDocuments = getLocalUploadedDocuments();

    return res.json({
      success: true,
      source: "local",
      message:
        "Daftar dokumen lokal berhasil dimuat. Google Drive belum aktif atau environment variable belum lengkap.",
      documents: localDocuments
    });
  } catch (error) {
    console.error("Get Drive Documents Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memuat daftar dokumen.",
      error: error.message,
      documents: []
    });
  }
});

app.get("/api/documents", async (req, res) => {
  try {
    return res.json({
      success: true,
      documents: getLocalUploadedDocuments()
    });
  } catch (error) {
    console.error("Get Documents Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar dokumen.",
      error: error.message,
      documents: []
    });
  }
});

app.post("/api/upload", upload.single("document"), async (req, res) => {
  try {
    if (!isValidAdminPin(req.body.pin)) {
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
      return res.status(400).json({
        success: false,
        message: "Format dokumen tidak didukung. Gunakan PDF, XLSX, atau XLS."
      });
    }

    const keywords = normalizeKeywords(req.body.keywords);

    if (googleDriveService && hasGoogleDriveEnv()) {
      const uploadedFile = await googleDriveService.uploadFileToDrive({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
      });

      const metadata = await googleDriveService.addDriveDocumentMetadata({
        fileName: uploadedFile.name,
        originalName: req.file.originalname,
        title: req.body.title || req.file.originalname,
        intent: req.body.intent || "umum",
        type,
        category: req.body.category || "Dokumen Akademik",
        link: req.body.link || "",
        keywords,
        driveFileId: uploadedFile.fileId,
        driveViewLink: uploadedFile.webViewLink,
        driveContentLink: uploadedFile.webContentLink
      });

      await loadDocuments();

      return res.json({
        success: true,
        source: "google_drive",
        message: "Dokumen berhasil di-upload ke Google Drive.",
        document: metadata
      });
    }

    const metadata = await saveToLocalUpload(req);

    return res.json({
      success: true,
      source: "local",
      message:
        "Dokumen berhasil di-upload secara lokal. Google Drive belum aktif atau environment variable belum lengkap.",
      document: metadata
    });
  } catch (error) {
    console.error("Upload Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Gagal meng-upload dokumen."
    });
  }
});

app.delete("/api/drive-documents/:documentId", async (req, res) => {
  try {
    const pin = req.query.pin || req.body?.pin;

    if (!isValidAdminPin(pin)) {
      return res.status(401).json({
        success: false,
        message: "PIN admin tidak sesuai."
      });
    }

    if (!googleDriveService || !hasGoogleDriveEnv()) {
      return res.status(400).json({
        success: false,
        message: "Google Drive belum aktif atau environment variable belum lengkap."
      });
    }

    const documentId = req.params.documentId;

    const targetDocument = await googleDriveService.getDriveDocumentById(documentId);

    if (!targetDocument) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan di metadata Google Drive."
      });
    }

    let fileDeleted = false;

    if (targetDocument.driveFileId) {
      fileDeleted = await googleDriveService.deleteFileFromDrive(
        targetDocument.driveFileId
      );
    }

    const metadataDeleted = await googleDriveService.deleteDriveDocumentMetadata(
      documentId
    );

    await loadDocuments();

    const latestDocuments = await googleDriveService.readDriveDocuments();

    return res.json({
      success: true,
      message: fileDeleted
        ? "Dokumen dan metadata berhasil dihapus dari Google Drive."
        : "Metadata berhasil dihapus. File Drive tidak ditemukan atau sudah terhapus.",
      deleted: {
        metadataDeleted,
        fileDeleted,
        title: targetDocument.title,
        fileName: targetDocument.fileName
      },
      documents: latestDocuments
    });
  } catch (error) {
    console.error("Delete Drive Document Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus dokumen.",
      error: error.message
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

    if (!uploadDocumentService) {
      return res.status(500).json({
        success: false,
        message: "uploadDocumentService tidak tersedia."
      });
    }

    const deleted = uploadDocumentService.deleteUploadedDocument(req.params.fileName);

    await loadDocuments();

    return res.json({
      success: true,
      message: deleted ? "Dokumen berhasil dihapus." : "Dokumen tidak ditemukan.",
      documents: getLocalUploadedDocuments()
    });
  } catch (error) {
    console.error("Delete Document Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus dokumen.",
      error: error.message
    });
  }
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/chat.html", (req, res) => {
  return res.sendFile(path.join(__dirname, "../public/chat.html"));
});

app.get("/admin.html", (req, res) => {
  return res.sendFile(path.join(__dirname, "../public/admin.html"));
});

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} tidak ditemukan.`
  });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Ukuran file terlalu besar. Maksimal 15 MB."
          : error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Terjadi kesalahan pada request."
    });
  }

  return next();
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

    app.listen(PORT, () => {
      console.log(`Server tetap berjalan di http://localhost:${PORT}`);
    });
  });