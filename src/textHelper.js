const chatbotConfig = require("./config/chatbotConfig");

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandSynonyms(text) {
  let result = normalizeText(text);

  chatbotConfig.synonyms.forEach((item) => {
    item.from.forEach((phrase) => {
      if (result.includes(normalizeText(phrase))) {
        result += " " + normalizeText(item.to);
      }
    });
  });

  return result;
}

function detectIntent(message) {
  const text = expandSynonyms(message);
  const scores = {};

  chatbotConfig.documents.forEach((document) => {
    if (!scores[document.intent]) {
      scores[document.intent] = 0;
    }

    document.keywords.forEach((keyword) => {
      const cleanKeyword = normalizeText(keyword);

      if (text.includes(cleanKeyword)) {
        scores[document.intent] += cleanKeyword.split(" ").length;
      }
    });
  });

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    return "umum";
  }

  const [topIntent, topScore] = sorted[0];

  return topScore > 0 ? topIntent : "umum";
}

function getKeywords(message) {
  const stopwords = [
    "apa",
    "aja",
    "saja",
    "yang",
    "di",
    "ke",
    "dari",
    "dan",
    "atau",
    "itu",
    "ini",
    "aku",
    "saya",
    "mau",
    "ingin",
    "tolong",
    "dong",
    "ya",
    "kak",
    "bro",
    "min",
    "admin",
    "untuk",
    "dengan",
    "adalah",
    "bagaimana",
    "gimana",
    "berapa",
    "kapan",
    "dimana",
    "mana",
    "bisa",
    "boleh",
    "minta",
    "info",
    "informasi"
  ];

  return expandSynonyms(message)
    .split(" ")
    .filter((word) => word.length > 2 && !stopwords.includes(word));
}

function scoreTextByKeywords(text, keywords) {
  const normalized = normalizeText(text);
  let score = 0;

  keywords.forEach((keyword) => {
    const key = normalizeText(keyword);

    if (!key) {
      return;
    }

    if (normalized.includes(key)) {
      score += key.length > 4 ? 3 : 1;
    }

    const words = key.split(" ");

    words.forEach((word) => {
      if (word.length > 2 && normalized.includes(word)) {
        score += 1;
      }
    });
  });

  return score;
}

module.exports = {
  normalizeText,
  expandSynonyms,
  detectIntent,
  getKeywords,
  scoreTextByKeywords
};