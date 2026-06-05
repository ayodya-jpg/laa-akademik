const { loadDocuments, getAllDocumentsInfo } = require("../src/documentService");

let isLoaded = false;

async function ensureLoaded() {
  if (!isLoaded) {
    await loadDocuments();
    isLoaded = true;
  }
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");

    await ensureLoaded();

    return res.status(200).json({
      success: true,
      message: "LAA Akademik Bot aktif di Vercel.",
      documents: getAllDocumentsInfo()
    });
  } catch (error) {
    console.error("Vercel Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memuat status chatbot."
    });
  }
};