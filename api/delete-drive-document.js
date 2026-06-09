const {
  getDriveDocumentById,
  deleteFileFromDrive,
  deleteDriveDocumentMetadata
} = require("../src/googleDriveService");

const { loadDocuments } = require("../src/documentService");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message: "Method tidak diizinkan. Gunakan POST."
      });
    }

    const { documentId, pin } = req.body || {};

    const cleanDocumentId = String(documentId || "").trim();
    const cleanPin = String(pin || "").trim();
    const adminPin = String(process.env.ADMIN_PIN || "").trim();

    if (!adminPin) {
      return res.status(500).json({
        success: false,
        message: "ADMIN_PIN belum diatur di environment variable."
      });
    }

    if (!cleanPin || cleanPin !== adminPin) {
      return res.status(401).json({
        success: false,
        message: "PIN admin tidak sesuai."
      });
    }

    if (!cleanDocumentId) {
      return res.status(400).json({
        success: false,
        message: "ID dokumen tidak ditemukan."
      });
    }

    const documentData = await getDriveDocumentById(cleanDocumentId);

    if (!documentData) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan di metadata Google Drive."
      });
    }

    if (documentData.driveFileId) {
      try {
        await deleteFileFromDrive(documentData.driveFileId);
      } catch (error) {
        console.error("Gagal menghapus file asli dari Google Drive:", error.message);
      }
    }

    await deleteDriveDocumentMetadata(cleanDocumentId);

    try {
      await loadDocuments();
    } catch (error) {
      console.error("Gagal reload knowledge base setelah delete:", error.message);
    }

    return res.status(200).json({
      success: true,
      message: "Dokumen berhasil dihapus dari Google Drive dan metadata.",
      deletedDocument: documentData
    });
  } catch (error) {
    console.error("Delete Drive Document API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus dokumen.",
      error: error.message
    });
  }
};