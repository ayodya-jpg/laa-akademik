const { readPdf } = require("./pdfService");
const { readExcelRows } = require("./excelService");
const {
  detectIntent,
  getKeywords,
  normalizeText,
  scoreTextByKeywords
} = require("./textHelper");
const { getSource, getAllRegisteredDocuments } = require("./sourceService");
const { buildUpdateContext } = require("./updateService");
const chatbotConfig = require("./config/chatbotConfig");

let documentsCache = [];

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

async function loadDocuments() {
  documentsCache = [];

  const allDocuments = getAllRegisteredDocuments();

  for (const document of allDocuments) {
    const fileType = String(document.type || "").toLowerCase();

    if (fileType === "pdf") {
      const pdfText = await readPdf(document.fileName);

      if (!pdfText || pdfText.trim().length === 0) {
        continue;
      }

      const chunks = splitIntoChunks(pdfText);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: document.fileName,
          type: "pdf",
          intent: document.intent || "umum",
          chunkId: index + 1,
          content: chunk
        });
      });
    }

    if (fileType === "excel") {
      const rows = readExcelRows(document.fileName);

      rows.forEach((row) => {
        documentsCache.push({
          fileName: document.fileName,
          type: "excel",
          intent: document.intent || "umum",
          chunkId: row.rowNumber,
          content: row.content
        });
      });
    }
  }
}

function scoreDocumentMetadata(message, document) {
  const normalizedMessage = normalizeText(message);
  let score = 0;

  const title = normalizeText(document.title);
  const category = normalizeText(document.category);
  const intent = normalizeText(document.intent);

  if (title && normalizedMessage.includes(title)) {
    score += 20;
  }

  if (category && normalizedMessage.includes(category)) {
    score += 14;
  }

  if (intent && normalizedMessage.includes(intent)) {
    score += 10;
  }

  if (Array.isArray(document.keywords)) {
    document.keywords.forEach((keyword) => {
      const cleanKeyword = normalizeText(keyword);

      if (!cleanKeyword) return;

      if (normalizedMessage.includes(cleanKeyword)) {
        score += cleanKeyword.split(" ").length + 10;
      }

      cleanKeyword.split(" ").forEach((word) => {
        if (word.length > 3 && normalizedMessage.includes(word)) {
          score += 2;
        }
      });
    });
  }

  return score;
}

function searchRelevantDocuments(message) {
  const intent = detectIntent(message);
  const keywords = getKeywords(message);
  const normalizedMessage = normalizeText(message);
  const allDocuments = getAllRegisteredDocuments();

  let selectedDocs = documentsCache;

  if (intent !== "umum") {
    selectedDocs = documentsCache.filter((doc) => doc.intent === intent);

    if (selectedDocs.length === 0) {
      selectedDocs = documentsCache;
    }
  }

  const results = [];

  const updateContext = buildUpdateContext(message);

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
      score: 999
    });
  }

  selectedDocs.forEach((doc) => {
    const normalizedContent = normalizeText(doc.content);
    const relatedDocument = allDocuments.find(
      (item) => item.fileName === doc.fileName
    );

    let score = scoreTextByKeywords(doc.content, keywords);

    if (doc.intent === intent) {
      score += 12;
    }

    if (normalizedContent.includes(normalizedMessage)) {
      score += 15;
    }

    if (relatedDocument) {
      score += scoreDocumentMetadata(message, relatedDocument);
    }

    if (score > 0) {
      results.push({
        fileName: doc.fileName,
        type: doc.type,
        intent: doc.intent,
        chunkId: doc.chunkId,
        source: getSource(doc.fileName),
        content: doc.content,
        score
      });
    }
  });

  results.sort((a, b) => b.score - a.score);

  return {
    intent,
    keywords,
    results: results.slice(0, chatbotConfig.retrieval.maxResults)
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
        source: getSource(doc.fileName)
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