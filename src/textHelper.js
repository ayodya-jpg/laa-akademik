const chatbotConfig = require("./config/chatbotConfig");

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeRepeatedChars(text) {
  return String(text || "").replace(/(.)\1{2,}/g, "$1$1");
}

function cleanUserText(text) {
  return normalizeText(removeRepeatedChars(text))
    .replace(/\baku\b/g, "saya")
    .replace(/\bgw\b/g, "saya")
    .replace(/\bgue\b/g, "saya")
    .replace(/\bsy\b/g, "saya")
    .replace(/\bmin\b/g, "")
    .replace(/\bkak\b/g, "")
    .replace(/\bbro\b/g, "")
    .replace(/\bdong\b/g, "")
    .replace(/\bya\b/g, "")
    .replace(/\byah\b/g, "")
    .replace(/\bnih\b/g, "")
    .replace(/\btuh\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandSynonyms(text) {
  let result = cleanUserText(text);

  const naturalSynonyms = [
    {
      from: ["gimana", "bagaimana", "caranya", "cara"],
      to: "cara prosedur langkah alur"
    },
    {
      from: ["kapan", "tanggal berapa", "tgl berapa", "periode"],
      to: "tanggal periode jadwal kapan"
    },
    {
      from: ["maks", "maksimal", "maximum"],
      to: "maksimal batas"
    },
    {
      from: ["minimal", "min"],
      to: "minimal syarat"
    },
    {
      from: ["butuh", "perlu", "apa aja", "apa saja"],
      to: "syarat dokumen berkas kebutuhan"
    },
    {
      from: ["daftar", "mendaftar", "pendaftaran", "registrasi"],
      to: "pendaftaran registrasi daftar"
    },
    {
      from: ["pak", "bu", "ibu", "bapak"],
      to: "dosen"
    },
    {
      from: ["nomor induk", "nip", "nip ypt"],
      to: "nip ypt nomor induk dosen"
    },
    {
      from: ["kode dosen", "kode"],
      to: "kode dosen baru"
    }
  ];

  naturalSynonyms.forEach((item) => {
    item.from.forEach((phrase) => {
      if (result.includes(normalizeText(phrase))) {
        result += " " + normalizeText(item.to);
      }
    });
  });

  chatbotConfig.synonyms.forEach((item) => {
    item.from.forEach((phrase) => {
      if (result.includes(normalizeText(phrase))) {
        result += " " + normalizeText(item.to);
      }
    });
  });

  chatbotConfig.documents.forEach((document) => {
    document.keywords.forEach((keyword) => {
      const cleanKeyword = normalizeText(keyword);

      if (result.includes(cleanKeyword)) {
        result += " " + document.intent + " " + document.category;
      }
    });
  });

  return result.replace(/\s+/g, " ").trim();
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
        scores[document.intent] += cleanKeyword.split(" ").length + 2;
      }

      cleanKeyword.split(" ").forEach((word) => {
        if (word.length > 3 && text.includes(word)) {
          scores[document.intent] += 1;
        }
      });
    });

    if (text.includes(normalizeText(document.category))) {
      scores[document.intent] += 8;
    }

    if (text.includes(document.intent)) {
      scores[document.intent] += 6;
    }
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
    "yah",
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
    "informasi",
    "tentang",
    "terkait",
    "dong",
    "nih"
  ];

  const expanded = expandSynonyms(message);

  return expanded
    .split(" ")
    .map((word) => normalizeText(word))
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
      score += key.length > 4 ? 4 : 2;
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

function getQuestionType(message) {
  const text = expandSynonyms(message);

  if (
    text.includes("kapan") ||
    text.includes("tanggal") ||
    text.includes("periode") ||
    text.includes("jadwal")
  ) {
    return "date";
  }

  if (
    text.includes("cara") ||
    text.includes("prosedur") ||
    text.includes("langkah") ||
    text.includes("alur")
  ) {
    return "procedure";
  }

  if (
    text.includes("syarat") ||
    text.includes("berkas") ||
    text.includes("dokumen") ||
    text.includes("perlu") ||
    text.includes("butuh")
  ) {
    return "requirement";
  }

  if (
    text.includes("dosen") ||
    text.includes("nip") ||
    text.includes("kode dosen") ||
    text.includes("pengampu")
  ) {
    return "lecturer";
  }

  if (
    text.includes("sks") ||
    text.includes("ips") ||
    text.includes("ipk") ||
    text.includes("nilai")
  ) {
    return "academic_rule";
  }

  return "general";
}

module.exports = {
  normalizeText,
  cleanUserText,
  expandSynonyms,
  detectIntent,
  getKeywords,
  scoreTextByKeywords,
  getQuestionType
};