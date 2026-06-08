const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

function resolveDataFilePath(fileName) {
  const mainPath = path.join(__dirname, "../data", fileName);
  const uploadPath = path.join(__dirname, "../data/uploads", fileName);

  if (fs.existsSync(mainPath)) {
    return mainPath;
  }

  if (fs.existsSync(uploadPath)) {
    return uploadPath;
  }

  return null;
}

async function readPdf(fileName) {
  try {
    const filePath = resolveDataFilePath(fileName);

    if (!filePath) {
      return "";
    }

    const buffer = fs.readFileSync(filePath);

    const originalWarn = console.warn;
    console.warn = function (...args) {
      const message = args.join(" ");

      if (
        message.includes("Warning: TT: undefined function") ||
        message.includes("undefined function")
      ) {
        return;
      }

      originalWarn.apply(console, args);
    };

    const data = await pdfParse(buffer);

    console.warn = originalWarn;

    return data.text || "";
  } catch (error) {
    return "";
  }
}

module.exports = {
  readPdf
};