const chatbotConfig = require("./config/chatbotConfig");

function getSource(fileName) {
  const source = chatbotConfig.documents.find(
    (document) => document.fileName === fileName
  );

  if (!source) {
    return {
      title: fileName,
      link: ""
    };
  }

  return {
    title: source.title,
    link: source.link || ""
  };
}

function getAllSources() {
  return chatbotConfig.documents.map((document) => ({
    fileName: document.fileName,
    title: document.title,
    type: document.type,
    intent: document.intent,
    category: document.category,
    link: document.link
  }));
}

module.exports = {
  getSource,
  getAllSources
};