const {
  readJsonFromDrive,
  saveJsonToDrive
} = require("../src/googleDriveService");

module.exports = async function handler(req, res) {
  try {
    const envCheck = {
      hasGoogleDriveFolderId: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
      hasGoogleServiceAccountEmail: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      hasGooglePrivateKey: Boolean(process.env.GOOGLE_PRIVATE_KEY),
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
      privateKeyStart: process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.slice(0, 35)
        : null,
      privateKeyEnd: process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.slice(-35)
        : null
    };

    const oldData = await readJsonFromDrive("drive-test.json", []);

    const newData = [
      ...oldData,
      {
        message: "Google Drive API berhasil digunakan dari Vercel",
        createdAt: new Date().toISOString()
      }
    ];

    await saveJsonToDrive("drive-test.json", newData);

    return res.status(200).json({
      success: true,
      message: "Google Drive API berhasil. File drive-test.json berhasil dibuat/diupdate.",
      envCheck,
      totalData: newData.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Google Drive API gagal.",
      error: error.message,
      stack: error.stack
    });
  }
};