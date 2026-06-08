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

  for (const document of chatbotConfig.documents) {
    if (document.type === "pdf") {
      const pdfText = await readPdf(document.fileName);

      if (!pdfText || pdfText.trim().length === 0) {
        continue;
      }

      const chunks = splitIntoChunks(pdfText);

      chunks.forEach((chunk, index) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: index + 1,
          content: chunk
        });
      });
    }

    if (document.type === "excel") {
      const rows = readExcelRows(document.fileName);

      rows.forEach((row) => {
        documentsCache.push({
          fileName: document.fileName,
          type: document.type,
          intent: document.intent,
          chunkId: row.rowNumber,
          content: row.content
        });
      });
    }
  }
}

async function searchRelevantDocuments(message) {
  const intent = detectIntent(message);
  const keywords = getKeywords(message);
  const normalizedMessage = normalizeText(message);

  let selectedDocs = documentsCache;

  if (intent !== "umum") {
    selectedDocs = documentsCache.filter((doc) => doc.intent === intent);

    if (selectedDocs.length === 0) {
      selectedDocs = documentsCache;
    }
  }

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
      score: 999
    });
  }

  selectedDocs.forEach((doc) => {
    const normalizedContent = normalizeText(doc.content);

    let score = scoreTextByKeywords(doc.content, keywords);

    if (doc.intent === intent) {
      score += 5;
    }

    if (normalizedContent.includes(normalizedMessage)) {
      score += 10;
    }

    const relatedDocument = chatbotConfig.documents.find(
      (item) => item.fileName === doc.fileName
    );

    if (relatedDocument && Array.isArray(relatedDocument.keywords)) {
      relatedDocument.keywords.forEach((keyword) => {
        if (normalizedMessage.includes(normalizeText(keyword))) {
          score += 4;
        }
      });
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