const sources = {
  "kalender-akademik2026.pdf": {
    title: "Kalender Akademik Telkom University 2026",
    link: "ISI_LINK_DRIVE_KALENDER_AKADEMIK"
  },
  "pedoman-akademik2026.pdf": {
    title: "Pedoman Akademik Telkom University 2026",
    link: "ISI_LINK_DRIVE_PEDOMAN_AKADEMIK"
  },
  "data-dosen2026.xlsx": {
    title: "Data Dosen 2026",
    link: "ISI_LINK_DRIVE_DATA_DOSEN"
  },
  "jadwal-kuliahgenap.xlsx": {
    title: "Jadwal Kuliah Semester Genap",
    link: "ISI_LINK_DRIVE_JADWAL_KULIAH"
  }
};

function getSource(fileName) {
  return sources[fileName] || {
    title: fileName,
    link: ""
  };
}

module.exports = {
  getSource
};