const {
  readJsonFromDrive,
  saveJsonToDrive
} = require("../src/googleDriveService");

module.exports = async function handler(req, res) {
  try {
    const envCheck = {
      hasGoogleDriveFolderId: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasGoogleRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
      clientIdStart: process.env.GOOGLE_CLIENT_ID
        ? process.env.GOOGLE_CLIENT_ID.slice(0, 20)
        : null,
      refreshTokenStart: process.env.GOOGLE_REFRESH_TOKEN
        ? process.env.GOOGLE_REFRESH_TOKEN.slice(0, 12)
        : null
    };

    const oldData = await readJsonFromDrive("drive-test.json", []);

    const newData = [
      ...oldData,
      {
        message: "Google Drive API OAuth berhasil digunakan dari Vercel",
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