const chatbotConfig = require("./config/chatbotConfig");
const { getAllRegisteredDocuments } = require("./sourceService");

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

function getNaturalSynonyms() {
  return [
    {
      from: ["gimana", "bagaimana", "caranya", "cara"],
      to: "cara prosedur langkah alur panduan"
    },
    {
      from: ["kapan", "tanggal berapa", "tgl berapa", "periode"],
      to: "tanggal periode jadwal kapan"
    },
    {
      from: ["maks", "maksimal", "maximum"],
      to: "maksimal batas ketentuan"
    },
    {
      from: ["minimal", "min"],
      to: "minimal syarat ketentuan"
    },
    {
      from: ["butuh", "perlu", "apa aja", "apa saja"],
      to: "syarat dokumen berkas kebutuhan ketentuan"
    },
    {
      from: ["daftar", "mendaftar", "pendaftaran", "registrasi"],
      to: "pendaftaran registrasi daftar pengajuan"
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
    },
    {
      from: ["kp", "kerja praktik", "kerja praktek", "magang", "internship"],
      to: "kp kerja praktik kerja praktek magang surat pengantar toss surat keterangan"
    },
    {
      from: ["toss"],
      to: "toss layanan akademik surat keterangan pengajuan"
    },
    {
      from: ["ta", "tugas akhir", "skripsi"],
      to: "tugas akhir skripsi sidang pembimbing penguji"
    }
  ];
}

function expandSynonyms(text) {
  let result = cleanUserText(text);

  getNaturalSynonyms().forEach((item) => {
    item.from.forEach((phrase) => {
      if (result.includes(normalizeText(phrase))) {
        result += " " + normalizeText(item.to);
      }
    });
  });

  if (Array.isArray(chatbotConfig.synonyms)) {
    chatbotConfig.synonyms.forEach((item) => {
      if (!Array.isArray(item.from)) return;

      item.from.forEach((phrase) => {
        if (result.includes(normalizeText(phrase))) {
          result += " " + normalizeText(item.to);
        }
      });
    });
  }

  getAllRegisteredDocuments().forEach((document) => {
    const title = normalizeText(document.title);
    const category = normalizeText(document.category);
    const intent = normalizeText(document.intent);

    if (title && result.includes(title)) {
      result += ` ${intent} ${category}`;
    }

    if (category && result.includes(category)) {
      result += ` ${intent} ${category}`;
    }

    if (!Array.isArray(document.keywords)) return;

    document.keywords.forEach((keyword) => {
      const cleanKeyword = normalizeText(keyword);

      if (cleanKeyword && result.includes(cleanKeyword)) {
        result += ` ${intent} ${category} ${cleanKeyword}`;
      }
    });
  });

  return result.replace(/\s+/g, " ").trim();
}

function scoreDocumentIntent(text, document) {
  let score = 0;

  const title = normalizeText(document.title);
  const category = normalizeText(document.category);
  const intent = normalizeText(document.intent);

  if (title && text.includes(title)) {
    score += 15;
  }

  if (category && text.includes(category)) {
    score += 10;
  }

  if (intent && text.includes(intent)) {
    score += 8;
  }

  if (Array.isArray(document.keywords)) {
    document.keywords.forEach((keyword) => {
      const cleanKeyword = normalizeText(keyword);

      if (!cleanKeyword) return;

      if (text.includes(cleanKeyword)) {
        score += cleanKeyword.split(" ").length + 6;
      }

      cleanKeyword.split(" ").forEach((word) => {
        if (word.length > 3 && text.includes(word)) {
          score += 1;
        }
      });
    });
  }

  return score;
}

function detectIntent(message) {
  const text = expandSynonyms(message);
  const scores = {};

  getAllRegisteredDocuments().forEach((document) => {
    if (!document.intent) return;

    const intent = document.intent;

    if (!scores[intent]) {
      scores[intent] = 0;
    }

    scores[intent] += scoreDocumentIntent(text, document);
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

    if (!key) return;

    if (normalized.includes(key)) {
      score += key.length > 4 ? 4 : 2;
    }

    key.split(" ").forEach((word) => {
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
    text.includes("alur") ||
    text.includes("panduan")
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

function isCorrectionMessage(message) {
  const text = normalizeText(message);

  return (
    text.includes("bukan") ||
    text.includes("salah") ||
    text.includes("keliru") ||
    text.includes("kok malah") ||
    text.includes("itu kan") ||
    text.includes("maksud saya") ||
    text.includes("maksudnya") ||
    text.includes("yang saya tanya") ||
    text.includes("yang aku tanya") ||
    text.includes("tidak sesuai") ||
    text.includes("ga sesuai") ||
    text.includes("nggak sesuai")
  );
}

module.exports = {
  normalizeText,
  cleanUserText,
  expandSynonyms,
  detectIntent,
  getKeywords,
  scoreTextByKeywords,
  getQuestionType,
  isCorrectionMessage
};