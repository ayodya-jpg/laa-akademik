const fs = require("fs");
const { IncomingForm } = require("formidable");

const {
  uploadFileToDrive,
  addDriveDocumentMetadata
} = require("../src/googleDriveService");

module.exports.config = {
  api: {
    bodyParser: false
  }
};

function getFieldValue(fields, key, defaultValue = "") {
  const value = fields[key];

  if (Array.isArray(value)) {
    return value[0] || defaultValue;
  }

  return value || defaultValue;
}

function getFileValue(files, key) {
  const file = files[key];

  if (Array.isArray(file)) {
    return file[0];
  }

  return file;
}

function detectFileType(fileName, mimeType) {
  const lowerName = String(fileName || "").toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();

  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) {
    return "pdf";
  }

  if (
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel")
  ) {
    return "excel";
  }

  return "file";
}

function parseForm(req) {
  const form = new IncomingForm({
    multiples: false,
    keepExtensions: true,

    /*
      Catatan:
      Vercel Serverless punya batas payload request.
      Agar aman, batasi file sekitar 4 MB.
      Kalau file terlalu besar, kompres PDF dulu sebelum upload.
    */
    maxFileSize: 4 * 1024 * 1024
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function normalizeKeywords(keywords) {
  return String(keywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message: "Method tidak diizinkan. Gunakan POST."
      });
    }

    const { fields, files } = await parseForm(req);

    const pin = String(getFieldValue(fields, "pin")).trim();
    const adminPin = String(process.env.ADMIN_PIN || "").trim();

    if (!adminPin) {
      return res.status(500).json({
        success: false,
        message: "ADMIN_PIN belum diatur di environment variable."
      });
    }

    if (pin !== adminPin) {
      return res.status(401).json({
        success: false,
        message: "PIN admin tidak sesuai."
      });
    }

    const uploadedFile =
      getFileValue(files, "document") ||
      getFileValue(files, "file") ||
      getFileValue(files, "upload");

    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        message: "File dokumen belum dipilih."
      });
    }

    const filePath = uploadedFile.filepath;
    const originalName =
      uploadedFile.originalFilename || uploadedFile.newFilename || "dokumen";
    const mimeType = uploadedFile.mimetype || "application/octet-stream";

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        message: "File upload tidak ditemukan di server."
      });
    }

    const type = detectFileType(originalName, mimeType);

    if (!["pdf", "excel"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Format file tidak didukung. Gunakan PDF, XLS, atau XLSX."
      });
    }

    const buffer = fs.readFileSync(filePath);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "File kosong atau tidak dapat dibaca."
      });
    }

    const title = String(getFieldValue(fields, "title", originalName)).trim();
    const intent = String(getFieldValue(fields, "intent", "umum")).trim();
    const category = String(
      getFieldValue(fields, "category", "Dokumen Akademik")
    ).trim();
    const keywordsRaw = String(getFieldValue(fields, "keywords", "")).trim();
    const link = String(getFieldValue(fields, "link", "")).trim();

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Judul dokumen wajib diisi."
      });
    }

    if (!intent) {
      return res.status(400).json({
        success: false,
        message: "Intent dokumen wajib diisi."
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Kategori dokumen wajib diisi."
      });
    }

    if (!keywordsRaw) {
      return res.status(400).json({
        success: false,
        message: "Keywords dokumen wajib diisi."
      });
    }

    const driveResult = await uploadFileToDrive({
      buffer,
      originalName,
      mimeType
    });

    if (!driveResult || !driveResult.fileId) {
      return res.status(500).json({
        success: false,
        message: "Upload ke Google Drive gagal. File ID tidak ditemukan."
      });
    }

    const metadata = await addDriveDocumentMetadata({
      fileName: driveResult.name || originalName,
      originalName,
      title,
      intent,
      type,
      category,
      keywords: normalizeKeywords(keywordsRaw),
      link,
      driveFileId: driveResult.fileId,
      driveViewLink: driveResult.webViewLink || "",
      driveContentLink: driveResult.webContentLink || ""
    });

    return res.status(200).json({
      success: true,
      message: "Dokumen berhasil di-upload ke Google Drive.",
      document: metadata,
      drive: driveResult
    });
  } catch (error) {
    console.error("Upload API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal upload dokumen ke Google Drive.",
      error: error.message
    });
  }
};