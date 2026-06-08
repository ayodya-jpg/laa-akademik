const fs = require("fs");
const formidable = require("formidable");
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
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    maxFileSize: 20 * 1024 * 1024
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

    const buffer = fs.readFileSync(filePath);

    const driveResult = await uploadFileToDrive({
      buffer,
      originalName,
      mimeType
    });

    const type = detectFileType(originalName, mimeType);

    const metadata = await addDriveDocumentMetadata({
      fileName: driveResult.name,
      originalName,
      title: getFieldValue(fields, "title", originalName),
      intent: getFieldValue(fields, "intent", "umum"),
      type,
      category: getFieldValue(fields, "category", "Dokumen Akademik"),
      keywords: getFieldValue(fields, "keywords", ""),
      link: getFieldValue(fields, "link", ""),
      driveFileId: driveResult.fileId,
      driveViewLink: driveResult.webViewLink,
      driveContentLink: driveResult.webContentLink
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