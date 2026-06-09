const {
  readDriveDocuments
} = require("../src/googleDriveService");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        message: "Method tidak diizinkan. Gunakan GET."
      });
    }

    const documents = await readDriveDocuments();

    return res.status(200).json({
      success: true,
      source: "google_drive",
      documents: documents || []
    });
  } catch (error) {
    console.error("Drive Documents API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar dokumen Google Drive.",
      error: error.message
    });
  }
};