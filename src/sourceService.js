const chatbotConfig = require("./config/chatbotConfig");
const { readUploadedDocuments } = require("./uploadDocumentService");

function getAllRegisteredDocuments() {
  return [
    ...chatbotConfig.documents,
    ...readUploadedDocuments()
  ];
}

function getSource(fileName) {
  const source = getAllRegisteredDocuments().find(
    (document) => document.fileName === fileName
  );

  if (!source) {
    return {
      title: fileName,
      link: ""
    };
  }

  return {
    title: source.title || fileName,
    link: source.link || ""
  };
}

function getAllSources() {
  return getAllRegisteredDocuments().map((document) => ({
    fileName: document.fileName,
    title: document.title,
    type: document.type,
    intent: document.intent,
    category: document.category,
    link: document.link || ""
  }));
}

module.exports = {
  getAllRegisteredDocuments,
  getSource,
  getAllSources
};