const fs = require("fs");
const path = require("path");

const isVercel = Boolean(process.env.VERCEL);

const documentsFilePath = path.join(__dirname, "../data/documents.json");
const uploadsDir = path.join(__dirname, "../data/uploads");

function ensureUploadsDir() {
  if (isVercel) {
    return;
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function ensureDocumentsFile() {
  if (isVercel) {
    return;
  }

  ensureUploadsDir();

  if (!fs.existsSync(documentsFilePath)) {
    fs.writeFileSync(documentsFilePath, "[]", "utf-8");
  }
}

function readUploadedDocuments() {
  try {
    if (!fs.existsSync(documentsFilePath)) {
      return [];
    }

    const rawData = fs.readFileSync(documentsFilePath, "utf-8");
    const parsedData = JSON.parse(rawData || "[]");

    if (!Array.isArray(parsedData)) {
      return [];
    }

    return parsedData;
  } catch (error) {
    return [];
  }
}

function saveUploadedDocuments(documents) {
  if (isVercel) {
    throw new Error(
      "Upload dokumen tidak dapat disimpan permanen di Vercel. Gunakan penyimpanan eksternal seperti Supabase Storage, Google Drive API, atau deploy backend ke Render/Railway."
    );
  }

  ensureDocumentsFile();

  fs.writeFileSync(
    documentsFilePath,
    JSON.stringify(documents, null, 2),
    "utf-8"
  );
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
  }

  return String(keywords || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function addUploadedDocument(metadata) {
  if (isVercel) {
    throw new Error(
      "Fitur upload dokumen tidak tersedia secara permanen di Vercel. Untuk Vercel, masukkan dokumen ke folder data secara manual sebelum deploy."
    );
  }

  const documents = readUploadedDocuments();

  const newDocument = {
    id: `doc-${Date.now()}`,
    fileName: metadata.fileName,
    originalName: metadata.originalName || metadata.fileName,
    title: metadata.title || metadata.originalName || metadata.fileName,
    intent: metadata.intent || "umum",
    type: metadata.type,
    category: metadata.category || "Dokumen Akademik",
    link: metadata.link || "",
    keywords: normalizeKeywords(metadata.keywords),
    uploadedAt: new Date().toISOString()
  };

  documents.push(newDocument);
  saveUploadedDocuments(documents);

  return newDocument;
}

function deleteUploadedDocument(fileName) {
  if (isVercel) {
    throw new Error(
      "Fitur hapus dokumen upload tidak tersedia di Vercel karena filesystem tidak permanen."
    );
  }

  const documents = readUploadedDocuments();
  const target = documents.find((document) => document.fileName === fileName);
  const remainingDocuments = documents.filter(
    (document) => document.fileName !== fileName
  );

  saveUploadedDocuments(remainingDocuments);

  if (target) {
    const filePath = path.join(uploadsDir, target.fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return Boolean(target);
}

function getUploadsDir() {
  ensureUploadsDir();
  return uploadsDir;
}

module.exports = {
  readUploadedDocuments,
  addUploadedDocument,
  deleteUploadedDocument,
  getUploadsDir
};