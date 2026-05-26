const { searchRelevantDocuments } = require("./documentService");
const { askGroq } = require("./aiService");

function isGreeting(message) {
  const text = message.toLowerCase();

  return [
    "halo",
    "hai",
    "hallo",
    "hello",
    "hi",
    "pagi",
    "siang",
    "sore",
    "malam",
    "assalamualaikum"
  ].some((word) => text.includes(word));
}

function isMenuRequest(message) {
  const text = message.toLowerCase();

  return ["menu", "help", "bantuan", "mulai", "fitur", "start"].some((word) =>
    text.includes(word)
  );
}

function getMainMenu() {
  return `Halo! 👋 Saya LAA Akademik Bot.

Saya bisa membantu kamu mencari informasi akademik berdasarkan dokumen dan data yang tersedia.

Silakan pilih menu berikut:

1. Kalender Akademik
2. Pedoman Akademik
3. Informasi SKS, IPS, IPK, dan Nilai
4. Informasi Tugas Akhir / Skripsi
5. Informasi Yudisium / Wisuda
6. Data Dosen
7. Jadwal Kuliah

Kamu juga bisa langsung bertanya dengan bahasa bebas.

Contoh:
- "kapan registrasi semester genap?"
- "kapan perkuliahan dimulai?"
- "berapa maksimal SKS kalau IPS di atas 3?"
- "apa syarat tugas akhir?"
- "jadwal kuliah kelas IS-06-01 hari Rabu?"
- "siapa dosen pengampu tata kelola?"`;
}

function convertMenuToQuestion(message) {
  const text = message.trim().toLowerCase();

  const menuMap = {
    "1": "kalender akademik registrasi perwalian prs minggu perkuliahan yudisium wisuda",
    "2": "pedoman akademik aturan akademik mahasiswa masa studi cuti perwalian",
    "3": "aturan SKS IPS IPK nilai NSM NMK indeks mutu mahasiswa",
    "4": "tugas akhir skripsi sidang pembimbing penguji laporan tugas akhir",
    "5": "yudisium wisuda kelulusan ijazah transkrip akademik",
    "6": "data dosen nama dosen prodi kode dosen dosen pengampu",
    "7": "jadwal kuliah kelas ruang hari jam mata kuliah dosen pengampu"
  };

  return menuMap[text] || message;
}

function buildFallbackAnswer() {
  return `Maaf, saya belum menemukan informasi yang benar-benar sesuai dari dataset yang tersedia.

Agar saya bisa bantu lebih tepat, coba tulis pertanyaan dengan detail seperti:
- nama kegiatan akademik, misalnya "registrasi", "PRS", "yudisium", atau "wisuda"
- nama kelas, misalnya "IS-06-01"
- nama mata kuliah
- nama dosen
- hari atau jam kuliah

Contoh:
"jadwal kuliah kelas IS-06-01 hari Rabu"
"kapan registrasi semester genap?"
"berapa maksimal SKS mahasiswa sarjana?"

Ketik "menu" untuk melihat daftar bantuan.`;
}

async function processChat(message) {
  const cleanMessage = message.trim();

  if (isGreeting(cleanMessage) || isMenuRequest(cleanMessage)) {
    return {
      answer: getMainMenu(),
      sources: []
    };
  }

  const convertedMessage = convertMenuToQuestion(cleanMessage);
  const search = searchRelevantDocuments(convertedMessage);

  if (!search.results.length) {
    return {
      answer: buildFallbackAnswer(),
      sources: []
    };
  }

  const topResults = search.results;

  const context = topResults
    .map((item, index) => {
      return `Data ${index + 1}
Sumber: ${item.source.title}
Jenis: ${item.type}
Isi:
${item.content}`;
    })
    .join("\n\n====================\n\n");

  const mainSource = topResults[0].source;

  const aiAnswer = await askGroq(cleanMessage, context, mainSource.title);

  const uniqueSources = [];
  const usedFileNames = new Set();

  topResults.forEach((item) => {
    if (!usedFileNames.has(item.fileName)) {
      usedFileNames.add(item.fileName);
      uniqueSources.push({
        title: item.source.title,
        link: item.source.link
      });
    }
  });

  let finalAnswer = aiAnswer;

  if (uniqueSources.length > 0) {
    finalAnswer += "\n\n📌 Sumber dokumen:";
    uniqueSources.forEach((source, index) => {
      finalAnswer += `\n${index + 1}. ${source.title}`;
      if (source.link && !source.link.includes("ISI_LINK")) {
        finalAnswer += `\n   Download: ${source.link}`;
      }
    });
  }

  finalAnswer += `\n\nKamu bisa bertanya lagi dengan lebih spesifik, atau ketik "menu" untuk melihat pilihan informasi lainnya.`;

  return {
    answer: finalAnswer,
    sources: uniqueSources
  };
}

module.exports = {
  processChat
};