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

  const synonymMap = [
    ["krs an", "krs registrasi perwalian"],
    ["krs", "krs registrasi perwalian"],
    ["irs", "krs registrasi perwalian"],
    ["perwalian", "registrasi perwalian krs"],
    ["ubah matkul", "prs perubahan rencana studi"],
    ["ganti matkul", "prs perubahan rencana studi"],
    ["ganti mata kuliah", "prs perubahan rencana studi"],
    ["prs", "prs perubahan rencana studi"],
    ["mulai kuliah", "minggu perkuliahan mulai kuliah"],
    ["awal kuliah", "minggu perkuliahan mulai kuliah"],
    ["ta", "tugas akhir skripsi sidang"],
    ["skripsi", "tugas akhir skripsi sidang"],
    ["lulus", "kelulusan yudisium wisuda"],
    ["sidang", "sidang tugas akhir yudisium"],
    ["nilai", "nilai nsm nmk indeks mutu"],
    ["ips", "ips ipk sks"],
    ["ipk", "ips ipk sks"],
    ["sks", "sks beban studi"],
    ["dosen wali", "dosen wali perwalian"],
    ["pengampu", "dosen pengampu mata kuliah"],
    ["kelas", "kelas jadwal kuliah ruang"],
    ["ruangan", "ruang kelas laboratorium"],
    ["lab", "laboratorium ruang kelas"]
  ];

  synonymMap.forEach(([key, value]) => {
    if (result.includes(key)) {
      result += " " + value;
    }
  });

  return result;
}

function detectIntent(message) {
  const text = expandSynonyms(message);

  const intents = {
    kalender: [
      "kalender",
      "jadwal akademik",
      "registrasi",
      "perwalian",
      "krs",
      "prs",
      "perubahan rencana studi",
      "mulai kuliah",
      "minggu perkuliahan",
      "semester genap",
      "semester ganjil",
      "wisuda",
      "yudisium",
      "tanggal",
      "periode",
      "deadline",
      "batas akhir"
    ],
    pedoman: [
      "pedoman",
      "aturan",
      "ketentuan",
      "sks",
      "ips",
      "ipk",
      "nilai",
      "nsm",
      "nmk",
      "cuti",
      "undur diri",
      "nonaktif",
      "tugas akhir",
      "skripsi",
      "sidang",
      "masa studi",
      "kelulusan",
      "dosen wali"
    ],
    dosen: [
      "dosen",
      "pengampu",
      "nama dosen",
      "kode dosen",
      "prodi",
      "nidn",
      "dosen wali"
    ],
    jadwal: [
      "jadwal kuliah",
      "jadwal kelas",
      "kelas",
      "ruang",
      "ruangan",
      "laboratorium",
      "lab",
      "mata kuliah",
      "matkul",
      "hari",
      "jam",
      "shift",
      "sbs",
      "ktt",
      "kuliah"
    ]
  };

  const scores = {};

  for (const [intent, keywords] of Object.entries(intents)) {
    scores[intent] = 0;

    keywords.forEach((keyword) => {
      if (text.includes(keyword)) {
        scores[intent] += keyword.split(" ").length;
      }
    });
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = sorted[0];

  return topScore > 0 ? topIntent : "umum";
}

function getKeywords(message) {
  const stopwords = [
    "apa", "aja", "saja", "yang", "di", "ke", "dari", "dan", "atau",
    "itu", "ini", "aku", "saya", "mau", "ingin", "tolong", "dong",
    "ya", "kak", "bro", "min", "admin", "untuk", "dengan", "adalah",
    "bagaimana", "gimana", "berapa", "kapan", "dimana", "mana",
    "bisa", "boleh", "minta", "info", "informasi"
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

    if (!key) return;

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