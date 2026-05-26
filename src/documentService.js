const { readPdf } = require("./pdfService");
const { readExcelRows } = require("./excelService");
const {
  detectIntent,
  getKeywords,
  normalizeText,
  scoreTextByKeywords
} = require("./textHelper");
const { getSource } = require("./sourceService");

let documentsCache = [];

function splitIntoChunks(text, maxLength = 1400) {
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

  const pdfFiles = [
    {
      fileName: "kalender-akademik2026.pdf",
      intent: "kalender",
      type: "pdf"
    },
    {
      fileName: "pedoman-akademik2026.pdf",
      intent: "pedoman",
      type: "pdf"
    },
    {
      fileName: "panduan-pendaftaran-sidang-TA.pdf",
      intent: "tugas_akhir",
      type: "pdf"
    }
  ];

  for (const file of pdfFiles) {
    const pdfText = await readPdf(file.fileName);

    if (!pdfText || pdfText.trim().length === 0) {
      continue;
    }

    const chunks = splitIntoChunks(pdfText);

    chunks.forEach((chunk, index) => {
      documentsCache.push({
        fileName: file.fileName,
        type: file.type,
        intent: file.intent,
        chunkId: index + 1,
        content: chunk
      });
    });
  }

  const excelFiles = [
    {
      fileName: "data-dosen2026.xlsx",
      intent: "dosen",
      type: "excel"
    },
    {
      fileName: "jadwal-kuliahgenap.xlsx",
      intent: "jadwal",
      type: "excel"
    }
  ];

  excelFiles.forEach((file) => {
    const rows = readExcelRows(file.fileName);

    rows.forEach((row) => {
      documentsCache.push({
        fileName: file.fileName,
        type: file.type,
        intent: file.intent,
        chunkId: row.rowNumber,
        content: row.content
      });
    });
  });
}

function searchRelevantDocuments(message) {
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

  selectedDocs.forEach((doc) => {
    const normalizedContent = normalizeText(doc.content);

    let score = scoreTextByKeywords(doc.content, keywords);

    if (doc.intent === intent) {
      score += 5;
    }

    if (normalizedContent.includes(normalizedMessage)) {
      score += 10;
    }

    if (intent === "jadwal" && doc.type === "excel") {
      score += 4;
    }

    if (intent === "dosen" && doc.type === "excel") {
      score += 4;
    }

    if (
      intent === "tugas_akhir" &&
      doc.fileName === "panduan-pendaftaran-sidang-TA.pdf"
    ) {
      score += 12;
    }

    if (
      normalizedMessage.includes("sidang") &&
      doc.fileName === "panduan-pendaftaran-sidang-TA.pdf"
    ) {
      score += 15;
    }

    if (
      normalizedMessage.includes("daftar") &&
      doc.fileName === "panduan-pendaftaran-sidang-TA.pdf"
    ) {
      score += 15;
    }

    if (
      normalizedMessage.includes("pendaftaran") &&
      doc.fileName === "panduan-pendaftaran-sidang-TA.pdf"
    ) {
      score += 15;
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
    results: results.slice(0, 10)
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

  return Object.values(grouped);
}

module.exports = {
  loadDocuments,
  searchRelevantDocuments,
  getAllDocumentsInfo
};