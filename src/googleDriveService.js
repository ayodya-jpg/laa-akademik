const { google } = require("googleapis");
const { Readable } = require("stream");

const METADATA_FILE_NAME = "documents-metadata.json";

function getPrivateKey() {
  return String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL belum diatur.");
  }

  if (!privateKey) {
    throw new Error("GOOGLE_PRIVATE_KEY belum diatur.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  return google.drive({
    version: "v3",
    auth
  });
}

function getDriveFolderId() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID belum diatur.");
  }

  return folderId;
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

async function uploadFileToDrive({ buffer, originalName, mimeType }) {
  const drive = getDriveClient();
  const folderId = getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: originalName,
      parents: [folderId]
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: bufferToStream(buffer)
    },
    fields: "id, name, mimeType, webViewLink, webContentLink, createdTime"
  });

  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      type: "anyone",
      role: "reader"
    }
  });

  return {
    fileId: response.data.id,
    name: response.data.name,
    mimeType: response.data.mimeType,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink,
    createdTime: response.data.createdTime
  };
}

async function findJsonFile(fileName) {
  const drive = getDriveClient();
  const folderId = getDriveFolderId();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 1
  });

  return response.data.files && response.data.files.length > 0
    ? response.data.files[0]
    : null;
}

async function createJsonFile(fileName, defaultData = []) {
  const drive = getDriveClient();
  const folderId = getDriveFolderId();

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json"
    },
    media: {
      mimeType: "application/json",
      body: bufferToStream(
        Buffer.from(JSON.stringify(defaultData, null, 2), "utf-8")
      )
    },
    fields: "id, name"
  });

  return response.data;
}

async function getJsonFile(fileName, defaultData = []) {
  const existingFile = await findJsonFile(fileName);

  if (existingFile) {
    return existingFile;
  }

  return createJsonFile(fileName, defaultData);
}

async function readJsonFromDrive(fileName, defaultData = []) {
  try {
    const drive = getDriveClient();
    const jsonFile = await getJsonFile(fileName, defaultData);

    const response = await drive.files.get(
      {
        fileId: jsonFile.id,
        alt: "media"
      },
      {
        responseType: "text"
      }
    );

    const rawData = response.data || JSON.stringify(defaultData);
    const parsedData = JSON.parse(rawData);

    return parsedData;
  } catch (error) {
    console.error(`Read Drive JSON Error (${fileName}):`, error.message);
    return defaultData;
  }
}

async function saveJsonToDrive(fileName, data) {
  const drive = getDriveClient();
  const jsonFile = await getJsonFile(fileName, []);

  await drive.files.update({
    fileId: jsonFile.id,
    media: {
      mimeType: "application/json",
      body: bufferToStream(Buffer.from(JSON.stringify(data, null, 2), "utf-8"))
    }
  });

  return data;
}

async function readDriveDocuments() {
  const data = await readJsonFromDrive(METADATA_FILE_NAME, []);

  if (!Array.isArray(data)) {
    return [];
  }

  return data;
}

async function saveDriveDocuments(documents) {
  return saveJsonToDrive(METADATA_FILE_NAME, documents);
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(keywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function addDriveDocumentMetadata(metadata) {
  const documents = await readDriveDocuments();

  const newDocument = {
    id: `drive-doc-${Date.now()}`,
    title: metadata.title || metadata.originalName || metadata.fileName,
    fileName: metadata.fileName,
    originalName: metadata.originalName || metadata.fileName,
    type: metadata.type || "pdf",
    intent: metadata.intent || "umum",
    category: metadata.category || "Dokumen Akademik",
    keywords: normalizeKeywords(metadata.keywords),
    link: metadata.link || "",
    driveFileId: metadata.driveFileId,
    driveViewLink: metadata.driveViewLink || "",
    driveContentLink: metadata.driveContentLink || "",
    source: "google_drive",
    uploadedAt: new Date().toISOString()
  };

  documents.push(newDocument);
  await saveDriveDocuments(documents);

  return newDocument;
}

async function deleteDriveDocumentMetadata(documentId) {
  const documents = await readDriveDocuments();
  const filteredDocuments = documents.filter((doc) => doc.id !== documentId);

  await saveDriveDocuments(filteredDocuments);

  return documents.length !== filteredDocuments.length;
}

module.exports = {
  uploadFileToDrive,
  readDriveDocuments,
  addDriveDocumentMetadata,
  deleteDriveDocumentMetadata,
  readJsonFromDrive,
  saveJsonToDrive
};