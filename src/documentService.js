const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");

const { readPdf } = require("./pdfService");
const { readExcelRows } = require("./excelService");
const {
  detectIntent,
  getKeywords,
  normalizeText,
  scoreTextByKeywords
} = require("./textHelper");
const { getSource } = require("./sourceService");
const { buildUpdateContext } = require("./updateService");
const chatbotConfig = require("./config/chatbotConfig");

let googleDriveService = null;
let uploadDocumentService = null;

try {
  googleDriveService = require("./googleDriveService");
} catch (error) {
  googleDriveService = null;
}

try {
  uploadDocumentService = require("./uploadDocumentService");
} catch (error) {
  uploadDocumentService = null;
}

let documentsCache = [];
let registeredDocumentsCache = [];

function hasGoogleDriveEnv() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

function splitIntoChunks(text, maxLength = chatbotConfig.retrieval.maxChunkLength) {
  const cleanedText = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  const blocks = cleanedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];

  blocks.forEach((block) => {
    if (block.length <= maxLength) {
      chunks.push(block);
      return;
    }

    const sentences = block.split(/(?<=[.!?])\s+/);
    let current = "";

    sentences.forEach((sentence) => {
      if ((current + " " + sentence).length <= maxLength) {
        current += " " + sentence;
      } else {
        if (current.trim()) {
          chunks.push(current.trim());
        }

        current = sentence;
      }
    });

    if (current.trim()) {
      chunks.push(current.trim());
    }
  });

  return chunks;
}

function cleanValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowToNaturalText(row) {
  const entries = Object.entries(row)
    .map(([key, value]) => {
      const cleanKey = cleanValue(key);
      const cleanVal = cleanValue(value);

      if (!cleanKey || !cleanVal) {
        return null;
      }

      return `${cleanKey}: ${cleanVal}`;
    })
    .filter(Boolean);

  return entries.join("; ");
}

async function readPdfFromBuffer(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("Read Drive PDF Error:", error.message);
    return "";
  }
}

function readExcelRowsFromBuffer(buffer, fileName) {
  try {
    const workbook = XLSX.read(buffer, {
      type: "buffer"
    });

    const allRows = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false
      });

      rows.forEach((row, index) => {
        const text = rowToNaturalText(row);

        if (text) {
          allRows.push({
            fileName,
            sheetName,
            rowNumber: index + 1,
            content: `Sheet ${sheetName}, baris ${index + 1}. ${text}`
          });
        }
      });
    });

    return allRows;
  } catch (error) {
    console.error("Read Drive Excel Error:", error.message);
    return [];
  }
}

function getUploadedDocuments() {
  if (!uploadDocumentService || !uploadDocumentService.readUploadedDocuments) {
    return [];
  }

  try {
    return uploadDocumentService.readUploadedDocuments();
  } catch (error) {
    console.error("Load Local Uploaded Metadata Error:", error.message);
    return [];
  }
}

async function getDriveDocuments() {
  if (!googleDriveService || !hasGoogleDriveEnv()) {
    return [];
  }

  try {
    const driveDocuments = await googleDriveService.readDriveDocuments();

    if (!Array.isArray(driveDocuments)) {
      return [];
    }

    return driveDocuments;
  } catch (error) {
    console.error("Load Drive Metadata Error:", error.message);
    return [];
  }
}

function buildSource(document) {
  return {
    title: document.title || document.originalName || document.fileName,
    link: document.driveViewLink || document.link || ""
  };
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

function normalizeDocument(document) {
  return {
    fileName: document.fileName,
    originalName: document.originalName || document.fileName,
    title: document.title || document.originalName || document.fileName,
    intent: document.intent || "umum",
    type: document.type || "pdf",
    category: document.category || "Dokumen Akademik",
    link: document.link || "",
    keywords: normalizeKeywords(document.keywords),
    driveFileId: document.driveFileId || "",
    driveViewLink: document.driveViewLink || "",
    driveContentLink: document.driveContentLink || "",
    uploadedAt: document.uploadedAt || "",
    source: document.source || ""
  };
}

async function loadLocalDocument(document) {
  try {
    if (document.type === "pdf") {
      const pdfText = await readPdf(document.fileName);

      if (!pdfText || pdfText.trim().length === 0) {
        console.warn(`PDF lokal kosong atau tidak terbaca: ${document.fileName}`);
        return;
      }

      const chunks = splitIntoChunks(pdfText);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: index + 1,
          source: buildSource(document),
          content: chunk
        });
      });

      return;
    }

    if (document.type === "excel") {
      const rows = readExcelRows(document.fileName);

      rows.forEach((row) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: row.rowNumber,
          source: buildSource(document),
          content: row.content
        });
      });
    }
  } catch (error) {
    console.error(`Load Local Document Error (${document.fileName}):`, error.message);
  }
}

async function loadDriveDocument(document) {
  if (!googleDriveService || !googleDriveService.downloadFileFromDrive) {
    return;
  }

  if (!document.driveFileId) {
    console.warn(`Drive file ID tidak tersedia untuk: ${document.fileName}`);
    return;
  }

  try {
    const buffer = await googleDriveService.downloadFileFromDrive(
      document.driveFileId
    );

    if (document.type === "pdf") {
      const pdfText = await readPdfFromBuffer(buffer);

      if (!pdfText || pdfText.trim().length === 0) {
        console.warn(`PDF Drive kosong atau tidak terbaca: ${document.fileName}`);
        return;
      }

      const chunks = splitIntoChunks(pdfText);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: index + 1,
          source: buildSource(document),
          content: chunk
        });
      });

      return;
    }

    if (document.type === "excel") {
      const rows = readExcelRowsFromBuffer(buffer, document.fileName);

      rows.forEach((row) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: row.rowNumber,
          source: buildSource(document),
          content: row.content
        });
      });
    }
  } catch (error) {
    console.error(`Load Drive Document Error (${document.fileName}):`, error.message);
  }
}

async function loadDocuments() {
  documentsCache = [];
  registeredDocumentsCache = [];

  const staticDocuments = chatbotConfig.documents || [];
  const uploadedDocuments = getUploadedDocuments();
  const driveDocuments = await getDriveDocuments();

  registeredDocumentsCache = [
    ...staticDocuments,
    ...uploadedDocuments,
    ...driveDocuments
  ].map(normalizeDocument);

  console.log(
    "Registered documents:",
    registeredDocumentsCache.map((doc) => ({
      title: doc.title,
      fileName: doc.fileName,
      intent: doc.intent,
      category: doc.category,
      source: doc.source,
      driveFileId: doc.driveFileId ? "ADA" : "TIDAK ADA",
      keywords: doc.keywords
    }))
  );

  for (const document of registeredDocumentsCache) {
    if (document.source === "google_drive" || document.driveFileId) {
      await loadDriveDocument(document);
    } else {
      await loadLocalDocument(document);
    }
  }

  console.log(`Knowledge base dimuat: ${documentsCache.length} chunk.`);
}

function getRelatedDocumentByFileName(fileName) {
  return registeredDocumentsCache.find((item) => item.fileName === fileName);
}

function buildMetadataText(document) {
  if (!document) return "";

  const keywords = Array.isArray(document.keywords)
    ? document.keywords.join(" ")
    : "";

  return [
    document.title,
    document.originalName,
    document.fileName,
    document.intent,
    document.category,
    document.link,
    document.driveViewLink,
    keywords
  ]
    .filter(Boolean)
    .join(" ");
}

function getSearchTokens(text) {
  return normalizeText(text)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => {
      return ![
        "yang",
        "dan",
        "atau",
        "untuk",
        "dengan",
        "dari",
        "pada",
        "dalam",
        "adalah",
        "apa",
        "siapa",
        "bagaimana",
        "cara",
        "tentang",
        "saya",
        "kamu",
        "anda",
        "ini",
        "itu",
        "min",
        "dong",
        "tolong"
      ].includes(word);
    });
}

function isStrongMetadataMatch(message, document) {
  const normalizedMessage = normalizeText(message);
  const normalizedMetadata = normalizeText(buildMetadataText(document));
  const messageTokens = getSearchTokens(message);

  if (!normalizedMessage || !normalizedMetadata) return false;

  if (normalizedMetadata.includes(normalizedMessage)) {
    return true;
  }

  if (document?.title) {
    const normalizedTitle = normalizeText(document.title);

    if (
      normalizedTitle.includes(normalizedMessage) ||
      normalizedMessage.includes(normalizedTitle)
    ) {
      return true;
    }
  }

  if (Array.isArray(document?.keywords)) {
    const keywordText = normalizeText(document.keywords.join(" "));

    if (
      keywordText.includes(normalizedMessage) ||
      normalizedMessage.includes(keywordText)
    ) {
      return true;
    }

    for (const keyword of document.keywords) {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) continue;

      if (
        normalizedKeyword.includes(normalizedMessage) ||
        normalizedMessage.includes(normalizedKeyword)
      ) {
        return true;
      }
    }
  }

  let matchedTokenCount = 0;

  messageTokens.forEach((token) => {
    if (normalizedMetadata.includes(token)) {
      matchedTokenCount += 1;
    }
  });

  /*
    Generic rule:
    Kalau minimal 2 kata penting dari pertanyaan cocok dengan metadata,
    dokumen dianggap strong match.

    Contoh:
    Pertanyaan: "Tim Kelola Kerja Praktik"
    Token cocok: kerja, praktik
    Maka dokumen kerja praktik dikunci.
  */
  return matchedTokenCount >= 2;
}

function getStrongMatchedDocuments(message) {
  return registeredDocumentsCache.filter((document) =>
    isStrongMetadataMatch(message, document)
  );
}

function scoreDocumentByQuestion(doc, message, intent, keywords, strongFileNames) {
  const relatedDocument = getRelatedDocumentByFileName(doc.fileName);
  const metadataText = buildMetadataText(relatedDocument);

  const normalizedMessage = normalizeText(message);
  const normalizedContent = normalizeText(doc.content);
  const normalizedMetadata = normalizeText(metadataText);
  const messageTokens = getSearchTokens(message);

  let score = 0;

  /*
    Skor isi dokumen.
  */
  score += scoreTextByKeywords(doc.content, keywords);

  /*
    Skor metadata dibuat besar agar dokumen upload admin tidak kalah
    dengan dokumen bawaan.
  */
  score += scoreTextByKeywords(metadataText, keywords) * 8;

  /*
    Intent hanya boost, bukan filter.
  */
  if (doc.intent === intent) {
    score += 10;
  }

  /*
    Exact match isi dokumen.
  */
  if (normalizedContent.includes(normalizedMessage)) {
    score += 40;
  }

  /*
    Exact match metadata.
  */
  if (normalizedMetadata.includes(normalizedMessage)) {
    score += 150;
  }

  /*
    Token match.
  */
  messageTokens.forEach((token) => {
    if (normalizedContent.includes(token)) {
      score += 3;
    }

    if (normalizedMetadata.includes(token)) {
      score += 25;
    }
  });

  /*
    Judul dokumen.
  */
  if (relatedDocument?.title) {
    const normalizedTitle = normalizeText(relatedDocument.title);

    if (
      normalizedTitle.includes(normalizedMessage) ||
      normalizedMessage.includes(normalizedTitle)
    ) {
      score += 200;
    }

    messageTokens.forEach((token) => {
      if (normalizedTitle.includes(token)) {
        score += 35;
      }
    });
  }

  /*
    Keywords admin.
  */
  if (Array.isArray(relatedDocument?.keywords)) {
    relatedDocument.keywords.forEach((keyword) => {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) return;

      if (
        normalizedKeyword.includes(normalizedMessage) ||
        normalizedMessage.includes(normalizedKeyword)
      ) {
        score += 250;
      }

      messageTokens.forEach((token) => {
        if (normalizedKeyword.includes(token)) {
          score += 35;
        }
      });
    });
  }

  /*
    Kalau metadata sudah strong match, dokumen dikunci dan diberi boost besar.
  */
  if (strongFileNames.has(doc.fileName)) {
    score += 1000;
  }

  /*
    Boost dokumen Google Drive.
  */
  if (relatedDocument?.source === "google_drive" || relatedDocument?.driveFileId) {
    score += 50;
  }

  return score;
}

async function searchRelevantDocuments(message) {
  const intent = detectIntent(message);
  const keywords = getKeywords(message);

  const results = [];

  const updateContext = await buildUpdateContext(message);

  if (updateContext) {
    results.push({
      fileName: "knowledge-updates.json",
      type: "database",
      intent: "update",
      chunkId: 1,
      source: {
        title: "Database Update Chatbot",
        link: ""
      },
      content: updateContext,
      score: 99999
    });
  }

  const strongMatchedDocuments = getStrongMatchedDocuments(message);

  const strongFileNames = new Set(
    strongMatchedDocuments.map((document) => document.fileName)
  );

  /*
    Kalau ada strong metadata match, pencarian dikunci ke dokumen tersebut.
    Ini mencegah dokumen lama seperti TA ikut menang.
  */
  let selectedDocs = documentsCache;

  if (strongFileNames.size > 0) {
    selectedDocs = documentsCache.filter((doc) =>
      strongFileNames.has(doc.fileName)
    );
  }

  selectedDocs.forEach((doc) => {
    const score = scoreDocumentByQuestion(
      doc,
      message,
      intent,
      keywords,
      strongFileNames
    );

    if (score > 0) {
      results.push({
        fileName: doc.fileName,
        type: doc.type,
        intent: doc.intent,
        chunkId: doc.chunkId,
        source: doc.source || getSource(doc.fileName),
        content: doc.content,
        score
      });
    }
  });

  results.sort((a, b) => b.score - a.score);

  const maxResults = chatbotConfig.retrieval.maxResults || 6;

  console.log(
    "Strong metadata match:",
    strongMatchedDocuments.map((doc) => ({
      title: doc.title,
      fileName: doc.fileName,
      intent: doc.intent,
      category: doc.category,
      keywords: doc.keywords
    }))
  );

  console.log(
    "Top retrieval:",
    results.slice(0, 5).map((item) => ({
      title: item.source?.title,
      fileName: item.fileName,
      score: item.score
    }))
  );

  return {
    intent,
    keywords,
    results: results.slice(0, maxResults)
  };
}

function getAllDocumentsInfo() {
  const grouped = {};

  registeredDocumentsCache.forEach((document) => {
    grouped[document.fileName] = {
      fileName: document.fileName,
      originalName: document.originalName,
      title: document.title,
      intent: document.intent,
      type: document.type,
      category: document.category,
      keywords: document.keywords || [],
      link: document.driveViewLink || document.link || "",
      driveViewLink: document.driveViewLink || "",
      source: buildSource(document),
      chunks: 0,
      uploadedAt: document.uploadedAt || ""
    };
  });

  documentsCache.forEach((doc) => {
    if (!grouped[doc.fileName]) {
      grouped[doc.fileName] = {
        fileName: doc.fileName,
        intent: doc.intent,
        type: doc.type,
        chunks: 0,
        source: doc.source || getSource(doc.fileName)
      };
    }

    grouped[doc.fileName].chunks += 1;
  });

  grouped["knowledge-updates.json"] = {
    fileName: "knowledge-updates.json",
    title: "Database Update Chatbot",
    intent: "update",
    type: "database",
    category: "Update Admin",
    keywords: ["update", "admin", "data terbaru"],
    chunks: 1,
    source: {
      title: "Database Update Chatbot",
      link: ""
    }
  };

  return Object.values(grouped);
}

module.exports = {
  loadDocuments,
  searchRelevantDocuments,
  getAllDocumentsInfo
};