const fs = require("fs");
const path = require("path");

const documentsFilePath = path.join(__dirname, "../data/documents.json");
const uploadsDir = path.join(__dirname, "../data/uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function ensureDocumentsFile() {
  ensureUploadsDir();

  if (!fs.existsSync(documentsFilePath)) {
    fs.writeFileSync(documentsFilePath, "[]", "utf-8");
  }
}

function readUploadedDocuments() {
  ensureDocumentsFile();

  try {
    const rawData = fs.readFileSync(documentsFilePath, "utf-8");
    const parsedData = JSON.parse(rawData || "[]");

    if (!Array.isArray(parsedData)) {
      return [];
    }

    return parsedData;
  } catch (error) {
    console.warn("Gagal membaca data dokumen upload:", error.message);
    return [];
  }
}

function saveUploadedDocuments(documents) {
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