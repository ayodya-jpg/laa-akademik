const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

async function readPdf(fileName) {
  const filePath = path.join(__dirname, "../data", fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`File PDF tidak ditemukan: ${fileName}`);
    return "";
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  return data.text || "";
}

module.exports = {
  readPdf
};