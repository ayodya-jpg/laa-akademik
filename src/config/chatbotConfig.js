const chatbotConfig = {
  botName: "LAA Akademik Bot",

  campusName: "Telkom University Surabaya",

  customerService: {
    name: "Customer Service LAA Akademik",
    phoneDisplay: "+62 813-3324-9642",
    phoneNumber: "6281333249642",
    whatsappLink:
      "https://wa.me/6281333249642?text=Halo%20CS%20LAA%20Akademik%2C%20saya%20ingin%20bertanya%20terkait%20layanan%20akademik."
  },

  persona: `
Kamu adalah LAA Akademik Bot, asisten digital layanan administrasi akademik
Telkom University Surabaya. Kamu membantu mahasiswa mencari informasi akademik
berdasarkan dokumen dan data akademik yang tersedia.
`,

  rules: [
    "Jawab hanya berdasarkan dataset akademik yang tersedia.",
    "Jangan mengarang informasi di luar konteks dokumen.",
    "Gunakan bahasa Indonesia yang ramah, natural, dan mudah dipahami mahasiswa.",
    "Jika informasi tidak ditemukan dalam dataset, sampaikan bahwa informasi belum tersedia pada data chatbot.",
    "Jika pengguna membutuhkan bantuan lebih lanjut, arahkan ke Customer Service LAA Akademik.",
    "Jangan menyebut istilah teknis seperti chunk, retrieval, context, atau dataset mentah kepada pengguna.",
    "Jika pertanyaan berkaitan dengan kalender akademik, sebutkan kegiatan dan tanggal/periode yang relevan.",
    "Jika pertanyaan berkaitan dengan pedoman akademik, jelaskan aturan dengan singkat dan jelas.",
    "Jika pertanyaan berkaitan dengan sidang TA, jelaskan alur, syarat, atau berkas secara runtut berdasarkan panduan yang tersedia."
  ],

  documents: [
    {
      fileName: "kalender-akademik2026.pdf",
      title: "Kalender Akademik Telkom University 2026",
      intent: "kalender",
      type: "pdf",
      category: "Kalender Akademik",
      link: "ISI_LINK_DRIVE_KALENDER_AKADEMIK",
      keywords: [
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
        "yudisium",
        "wisuda",
        "tanggal",
        "periode",
        "batas akhir",
        "deadline"
      ]
    },

    {
      fileName: "pedoman-akademik2026.pdf",
      title: "Pedoman Akademik Telkom University 2026",
      intent: "pedoman",
      type: "pdf",
      category: "Pedoman Akademik",
      link: "ISI_LINK_DRIVE_PEDOMAN_AKADEMIK",
      keywords: [
        "pedoman",
        "aturan akademik",
        "ketentuan akademik",
        "sks",
        "ips",
        "ipk",
        "nilai",
        "nsm",
        "nmk",
        "masa studi",
        "cuti",
        "undur diri",
        "nonaktif",
        "dosen wali",
        "kelulusan",
        "tugas akhir"
      ]
    },

    {
      fileName: "panduan-pendaftaran-sidang-TA.pdf",
      title: "Panduan Pendaftaran Sidang Tugas Akhir",
      intent: "tugas_akhir",
      type: "pdf",
      category: "Pendaftaran Sidang TA",
      link: "ISI_LINK_DRIVE_PANDUAN_SIDANG_TA",
      keywords: [
        "ta",
        "tugas akhir",
        "skripsi",
        "sidang",
        "sidang ta",
        "sidang tugas akhir",
        "pendaftaran sidang",
        "pendaftaran sidang ta",
        "daftar sidang",
        "daftar sidang ta",
        "cara daftar sidang",
        "syarat sidang",
        "syarat sidang ta",
        "berkas sidang",
        "berkas sidang ta",
        "dokumen sidang",
        "pembimbing",
        "penguji",
        "proposal ta",
        "laporan ta"
      ]
    },

    {
      fileName: "data-dosen2026.xlsx",
      title: "Data Dosen 2026",
      intent: "dosen",
      type: "excel",
      category: "Data Dosen",
      link: "ISI_LINK_DRIVE_DATA_DOSEN",
      keywords: [
        "dosen",
        "nama dosen",
        "kode dosen",
        "pengampu",
        "dosen pengampu",
        "prodi",
        "program studi",
        "nidn",
        "dosen wali"
      ]
    }
  ],

  menus: [
    {
      number: "1",
      label: "Kalender Akademik",
      query:
        "kalender akademik registrasi perwalian krs prs minggu perkuliahan yudisium wisuda"
    },
    {
      number: "2",
      label: "Pedoman Akademik",
      query:
        "pedoman akademik aturan akademik mahasiswa masa studi cuti sks nilai"
    },
    {
      number: "3",
      label: "SKS, IPS, IPK, dan Nilai",
      query:
        "aturan SKS IPS IPK nilai NSM NMK indeks mutu beban studi mahasiswa"
    },
    {
      number: "4",
      label: "Tugas Akhir / Skripsi",
      query:
        "tugas akhir skripsi sidang pembimbing penguji laporan tugas akhir"
    },
    {
      number: "5",
      label: "Pendaftaran Sidang TA",
      query:
        "pendaftaran sidang tugas akhir syarat sidang ta berkas sidang ta daftar sidang ta"
    },
    {
      number: "6",
      label: "Yudisium / Wisuda",
      query:
        "yudisium wisuda kelulusan ijazah transkrip akademik"
    },
    {
      number: "7",
      label: "Data Dosen",
      query:
        "data dosen nama dosen prodi kode dosen dosen pengampu"
    }
  ],

  synonyms: [
    {
      from: ["krs an", "krs", "irs", "ngisi krs", "ambil matkul"],
      to: "krs registrasi perwalian pengisian mata kuliah"
    },
    {
      from: ["ubah matkul", "ganti matkul", "ganti mata kuliah", "prs"],
      to: "prs perubahan rencana studi"
    },
    {
      from: ["mulai kuliah", "awal kuliah", "masuk kuliah"],
      to: "minggu perkuliahan mulai kuliah"
    },
    {
      from: ["ta", "skripsi", "tugas akhir"],
      to: "tugas akhir skripsi sidang pembimbing penguji"
    },
    {
      from: [
        "sidang ta",
        "sidang tugas akhir",
        "daftar sidang",
        "daftar sidang ta",
        "cara daftar sidang",
        "cara daftar sidang ta",
        "pendaftaran sidang",
        "pendaftaran sidang ta"
      ],
      to: "pendaftaran sidang tugas akhir syarat sidang ta berkas sidang ta"
    },
    {
      from: ["syarat sidang", "syarat sidang ta"],
      to: "persyaratan sidang tugas akhir"
    },
    {
      from: ["berkas sidang", "berkas sidang ta", "dokumen sidang"],
      to: "dokumen persyaratan sidang tugas akhir"
    },
    {
      from: ["lulus", "kelulusan"],
      to: "kelulusan yudisium wisuda"
    },
    {
      from: ["nilai"],
      to: "nilai nsm nmk indeks mutu"
    },
    {
      from: ["ips", "ipk", "sks"],
      to: "ips ipk sks beban studi"
    },
    {
      from: ["pengampu"],
      to: "dosen pengampu mata kuliah"
    }
  ],

  fallbackMessage: `
Maaf, saya belum menemukan informasi yang benar-benar sesuai dari data yang tersedia.

Agar saya bisa bantu lebih tepat, coba tulis pertanyaan dengan lebih spesifik, misalnya:
- "kapan registrasi semester genap?"
- "berapa maksimal SKS kalau IPS di atas 3?"
- "bagaimana cara daftar sidang TA?"
- "apa saja berkas sidang TA?"
- "kapan yudisium?"
- "siapa dosen pengampu?"

Jika informasi masih belum ditemukan, kamu dapat menghubungi Customer Service LAA Akademik melalui WhatsApp.
`,

  groq: {
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
    maxTokens: 450,
    contextLimit: 3500
  },

  retrieval: {
    maxChunkLength: 900,
    maxResults: 4
  }
};

module.exports = chatbotConfig;