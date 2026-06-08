const fs = require("fs");
const path = require("path");
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
    const rootPath = process.cwd();

    const diagnostics = {
      cwd: rootPath,
      hasPackageJson: fs.existsSync(path.join(rootPath, "package.json")),
      hasDataFolder: fs.existsSync(path.join(rootPath, "data")),
      hasSrcFolder: fs.existsSync(path.join(rootPath, "src")),
      hasPublicFolder: fs.existsSync(path.join(rootPath, "public")),
      hasKalenderPdf: fs.existsSync(path.join(rootPath, "data", "kalender-akademik2026.pdf")),
      hasPedomanPdf: fs.existsSync(path.join(rootPath, "data", "pedoman-akademik2026.pdf")),
      hasSidangTaPdf: fs.existsSync(path.join(rootPath, "data", "panduan-pendaftaran-sidang-TA.pdf")),
      hasDataDosenExcel: fs.existsSync(path.join(rootPath, "data", "data-dosen2026.xlsx")),
      hasDocumentsJson: fs.existsSync(path.join(rootPath, "data", "documents.json")),
      hasUploadsFolder: fs.existsSync(path.join(rootPath, "data", "uploads"))
    };

    await ensureLoaded();

    return res.status(200).json({
      success: true,
      message: "LAA Akademik Bot aktif di Vercel.",
      diagnostics,
      documents: getAllDocumentsInfo()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Gagal memuat status chatbot.",
      error: error.message,
      stack: error.stack
    });
  }
};