const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function resolveDataFilePath(fileName) {
  const mainPath = path.join(__dirname, "../data", fileName);
  const uploadPath = path.join(__dirname, "../data/uploads", fileName);

  if (fs.existsSync(mainPath)) {
    return mainPath;
  }

  if (fs.existsSync(uploadPath)) {
    return uploadPath;
  }

  return mainPath;
}

function cleanValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowToNaturalText(row) {
  const entries = Object.entries(row)
    .map(([key, value]) => {
      const cleanKey = cleanValue(key);
      const cleanVal = cleanValue(value);

      if (!cleanKey || !cleanVal) return null;

      return `${cleanKey}: ${cleanVal}`;
    })
    .filter(Boolean);

  return entries.join("; ");
}

function readExcelRows(fileName) {
  const filePath = resolveDataFilePath(fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`File Excel tidak ditemukan: ${fileName}`);
    return [];
  }

  const workbook = XLSX.readFile(filePath);
  const allRows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false
    });

    rows.forEach((row, index) => {
      const text = rowToNaturalText(row);

      if (text) {
        allRows.push({
          fileName,
          sheetName,
          rowNumber: index + 1,
          content: `Sheet ${sheetName}, baris ${index + 1}. ${text}`
        });
      }
    });
  });

  return allRows;
}

function readExcel(fileName) {
  return readExcelRows(fileName)
    .map((item) => item.content)
    .join("\n");
}

module.exports = {
  readExcel,
  readExcelRows
};