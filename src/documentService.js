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

try {
  googleDriveService = require("./googleDriveService");
} catch (error) {
  googleDriveService = null;
}

let documentsCache = [];
let registeredDocumentsCache = [];

function splitIntoChunks(text, maxLength = chatbotConfig.retrieval.maxChunkLength) {
  const cleanedText = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText) {
    return [];
  }

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

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function buildMetadataText(document) {
  return [
    document.title,
    document.fileName,
    document.originalName,
    document.intent,
    document.category,
    document.link,
    document.driveViewLink,
    normalizeArray(document.keywords).join(" ")
  ]
    .join(" ")
    .toLowerCase();
}

function getDocumentTitle(document) {
  return (
    document.title ||
    document.originalName ||
    document.fileName ||
    "Dokumen Akademik"
  );
}

function getDocumentSource(document) {
  if (document.source === "google_drive" || document.driveFileId) {
    return {
      title: getDocumentTitle(document),
      link: document.driveViewLink || document.link || ""
    };
  }

  const source = getSource(document.fileName);

  return {
    title: source.title || getDocumentTitle(document),
    link: source.link || document.link || ""
  };
}

function buildLocalDocumentInfo(document) {
  return {
    ...document,
    source: "local",
    title: document.title || getSource(document.fileName).title || document.fileName,
    originalName: document.originalName || document.fileName,
    keywords: normalizeArray(document.keywords)
  };
}

function buildDriveDocumentInfo(document) {
  return {
    ...document,
    source: "google_drive",
    title: document.title || document.originalName || document.fileName,
    originalName: document.originalName || document.fileName,
    fileName: document.fileName || document.originalName,
    type: document.type || detectFileType(document.originalName || document.fileName, ""),
    intent: document.intent || "umum",
    category: document.category || "Dokumen Akademik",
    keywords: normalizeArray(document.keywords)
  };
}

async function extractDriveDocumentText(document) {
  if (!googleDriveService || !googleDriveService.downloadFileFromDrive) {
    console.log("Google Drive service / downloadFileFromDrive belum tersedia.");
    return "";
  }

  if (!document.driveFileId) {
    console.log("Drive file ID kosong:", document.title);
    return "";
  }

  const buffer = await googleDriveService.downloadFileFromDrive(document.driveFileId);

  if (!buffer || buffer.length === 0) {
    console.log("Buffer Drive kosong:", document.title);
    return "";
  }

  const type = detectFileType(
    document.originalName || document.fileName,
    document.mimeType || document.type
  );

  if (type === "pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (type === "excel") {
    const workbook = XLSX.read(buffer, {
      type: "buffer"
    });

    const rowsText = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false
      });

      rows.forEach((row, index) => {
        const content = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join("; ");

        if (content.trim()) {
          rowsText.push(`Sheet: ${sheetName}; Baris: ${index + 2}; ${content}`);
        }
      });
    });

    return rowsText.join("\n");
  }

  return "";
}

async function loadLocalDocuments() {
  for (const document of chatbotConfig.documents) {
    const docInfo = buildLocalDocumentInfo(document);

    registeredDocumentsCache.push(docInfo);

    if (docInfo.type === "pdf") {
      const pdfText = await readPdf(docInfo.fileName);

      if (!pdfText || pdfText.trim().length === 0) {
        continue;
      }

      const chunks = splitIntoChunks(pdfText);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: docInfo.fileName,
          type: docInfo.type,
          intent: docInfo.intent,
          chunkId: index + 1,
          sourceInfo: getDocumentSource(docInfo),
          documentInfo: docInfo,
          content: chunk
        });
      });
    }

    if (docInfo.type === "excel") {
      const rows = readExcelRows(docInfo.fileName);

      rows.forEach((row) => {
        documentsCache.push({
          fileName: docInfo.fileName,
          type: docInfo.type,
          intent: docInfo.intent,
          chunkId: row.rowNumber,
          sourceInfo: getDocumentSource(docInfo),
          documentInfo: docInfo,
          content: row.content
        });
      });
    }
  }
}

async function loadDriveDocuments() {
  if (!googleDriveService || !googleDriveService.readDriveDocuments) {
    console.log("Google Drive service belum aktif di documentService.");
    return;
  }

  const driveDocuments = await googleDriveService.readDriveDocuments();

  console.log(
    "Drive metadata terbaca:",
    (driveDocuments || []).map((doc) => ({
      title: doc.title,
      fileName: doc.fileName,
      originalName: doc.originalName,
      driveFileId: doc.driveFileId
    }))
  );

  for (const rawDocument of driveDocuments || []) {
    const docInfo = buildDriveDocumentInfo(rawDocument);

    registeredDocumentsCache.push(docInfo);

    try {
      const text = await extractDriveDocumentText(docInfo);

      console.log(
        `Drive text length: ${docInfo.title} = ${String(text || "").length}`
      );

      if (!text || text.trim().length === 0) {
        const metadataFallback = `
Judul Dokumen: ${docInfo.title}
Nama File: ${docInfo.originalName || docInfo.fileName}
Intent: ${docInfo.intent}
Kategori: ${docInfo.category}
Keywords: ${normalizeArray(docInfo.keywords).join(", ")}
Link: ${docInfo.driveViewLink || docInfo.link || ""}
        `.trim();

        documentsCache.push({
          fileName: docInfo.fileName || docInfo.originalName,
          type: docInfo.type,
          intent: docInfo.intent,
          chunkId: 1,
          sourceInfo: getDocumentSource(docInfo),
          documentInfo: docInfo,
          content: metadataFallback
        });

        console.log(`Drive metadata fallback dimuat: ${docInfo.title}`);
        continue;
      }

      const chunks = splitIntoChunks(text);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: docInfo.fileName || docInfo.originalName,
          type: docInfo.type,
          intent: docInfo.intent,
          chunkId: index + 1,
          sourceInfo: getDocumentSource(docInfo),
          documentInfo: docInfo,
          content: chunk
        });
      });

      console.log(`Drive document dimuat: ${docInfo.title} (${chunks.length} chunk)`);
    } catch (error) {
      console.error(`Gagal membaca dokumen Drive: ${docInfo.title}`, error.message);
    }
  }
}

async function loadDocuments() {
  documentsCache = [];
  registeredDocumentsCache = [];

  await loadLocalDocuments();
  await loadDriveDocuments();

  console.log(`Knowledge base dimuat: ${documentsCache.length} chunk.`);
  console.log(
    "Registered documents:",
    registeredDocumentsCache.map((doc) => ({
      title: doc.title,
      fileName: doc.fileName,
      source: doc.source,
      intent: doc.intent,
      keywords: doc.keywords
    }))
  );
}

function getImportantTokens(text) {
  const stopwords = new Set([
    "apa",
    "siapa",
    "yang",
    "di",
    "ke",
    "dari",
    "dan",
    "atau",
    "untuk",
    "dengan",
    "tentang",
    "info",
    "informasi",
    "data",
    "dokumen",
    "saya",
    "kamu",
    "adalah",
    "itu",
    "ini",
    "berapa",
    "bagaimana",
    "cara",
    "alur",
    "prosedur"
  ]);

  return normalizeText(text)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .filter((item) => !stopwords.has(item));
}

function isStrongMetadataMatch(message, document) {
  const normalizedMessage = normalizeText(message);
  const metadataText = normalizeText(buildMetadataText(document));
  const tokens = getImportantTokens(message);

  if (!normalizedMessage || !metadataText) {
    return false;
  }

  if (metadataText.includes(normalizedMessage)) {
    return true;
  }

  if (document.title && normalizedMessage.includes(normalizeText(document.title))) {
    return true;
  }

  const keywords = normalizeArray(document.keywords);

  const keywordMatched = keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);

    return (
      normalizedKeyword &&
      (normalizedMessage.includes(normalizedKeyword) ||
        metadataText.includes(normalizedKeyword))
    );
  });

  if (keywordMatched) {
    return true;
  }

  const matchedTokens = tokens.filter((token) => metadataText.includes(token));

  return matchedTokens.length >= 1;
}

function getStrongMatchedDocuments(message) {
  return registeredDocumentsCache.filter((document) =>
    isStrongMetadataMatch(message, document)
  );
}

function isLecturerQuestion(message) {
  const text = normalizeText(message);

  return (
    text.includes("dosen") ||
    text.includes("nip") ||
    text.includes("nip ypt") ||
    text.includes("kode dosen")
  );
}

function scoreDocumentByQuestion(doc, message, intent, keywords, strongFileNames) {
  const normalizedMessage = normalizeText(message);
  const normalizedContent = normalizeText(doc.content);
  const metadataText = normalizeText(buildMetadataText(doc.documentInfo || {}));

  let score = 0;

  score += scoreTextByKeywords(doc.content, keywords);

  keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeText(keyword);

    if (normalizedContent.includes(normalizedKeyword)) {
      score += 8;
    }

    if (metadataText.includes(normalizedKeyword)) {
      score += 18;
    }
  });

  const messageTokens = getImportantTokens(message);

  messageTokens.forEach((token) => {
    if (normalizedContent.includes(token)) {
      score += 8;
    }

    if (metadataText.includes(token)) {
      score += 20;
    }
  });

  if (doc.intent === intent && intent !== "umum") {
    score += 15;
  }

  if (normalizedContent.includes(normalizedMessage)) {
    score += 30;
  }

  if (metadataText.includes(normalizedMessage)) {
    score += 50;
  }

  if (strongFileNames.has(doc.fileName)) {
    score += 1000;
  }

  if (doc.documentInfo?.source === "google_drive") {
    score += 35;
  }

  return score;
}

async function searchRelevantDocuments(message) {
  if (!documentsCache.length) {
    await loadDocuments();
  }

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
      score: 2000
    });
  }

  const strongDocuments = getStrongMatchedDocuments(message);
  const strongFileNames = new Set(
    strongDocuments.map((doc) => doc.fileName || doc.originalName)
  );

  console.log(
    "Strong metadata match:",
    strongDocuments.map((doc) => ({
      title: doc.title,
      fileName: doc.fileName,
      source: doc.source
    }))
  );

  let selectedDocs = documentsCache;

  if (strongFileNames.size > 0) {
    selectedDocs = documentsCache.filter((doc) => strongFileNames.has(doc.fileName));
  } else if (intent !== "umum") {
    const intentDocs = documentsCache.filter((doc) => doc.intent === intent);

    if (intentDocs.length > 0) {
      selectedDocs = intentDocs;
    }
  }

  if (isLecturerQuestion(message)) {
    const lecturerDocs = documentsCache.filter((doc) => {
      const sourceTitle = normalizeText(doc.sourceInfo?.title || "");
      const fileName = normalizeText(doc.fileName || "");
      const content = normalizeText(doc.content || "");

      return (
        sourceTitle.includes("data dosen") ||
        fileName.includes("dosen") ||
        content.includes("nip ypt") ||
        content.includes("kode dosen")
      );
    });

    const existingKeys = new Set(
      selectedDocs.map((doc) => `${doc.fileName}-${doc.chunkId}`)
    );

    lecturerDocs.forEach((doc) => {
      const key = `${doc.fileName}-${doc.chunkId}`;

      if (!existingKeys.has(key)) {
        selectedDocs.push(doc);
      }
    });
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
        source: doc.sourceInfo,
        content: doc.content,
        score
      });
    }
  });

  results.sort((a, b) => b.score - a.score);

  console.log(
    "Top retrieval:",
    results.slice(0, 8).map((item) => ({
      title: item.source.title,
      fileName: item.fileName,
      score: item.score
    }))
  );

  return {
    intent,
    keywords,
    results: results.slice(0, chatbotConfig.retrieval.maxResults || 6)
  };
}

function getAllDocumentsInfo() {
  const grouped = {};

  documentsCache.forEach((doc) => {
    if (!grouped[doc.fileName]) {
      grouped[doc.fileName] = {
        fileName: doc.fileName,
        intent: doc.intent,
        type: doc.type,
        chunks: 0,
        source: doc.sourceInfo
      };
    }

    grouped[doc.fileName].chunks += 1;
  });

  grouped["knowledge-updates.json"] = {
    fileName: "knowledge-updates.json",
    intent: "update",
    type: "database",
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