const fs = require("fs");
const path = require("path");
const { readJsonFromDrive, saveJsonToDrive } = require("./googleDriveService");

const updateFilePath = path.join(__dirname, "../data/knowledge-updates.json");
const DRIVE_UPDATE_FILE_NAME = "knowledge-updates.json";

function isVercelEnvironment() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

function ensureUpdateFileExists() {
  const dataDir = path.dirname(updateFilePath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(updateFilePath)) {
    fs.writeFileSync(updateFilePath, "[]", "utf-8");
  }
}

async function readUpdates() {
  if (isVercelEnvironment()) {
    const updates = await readJsonFromDrive(DRIVE_UPDATE_FILE_NAME, []);
    return Array.isArray(updates) ? updates : [];
  }

  ensureUpdateFileExists();

  try {
    const rawData = fs.readFileSync(updateFilePath, "utf-8");
    const parsedData = JSON.parse(rawData || "[]");

    if (!Array.isArray(parsedData)) {
      return [];
    }

    return parsedData;
  } catch (error) {
    return [];
  }
}

async function saveUpdates(updates) {
  if (isVercelEnvironment()) {
    await saveJsonToDrive(DRIVE_UPDATE_FILE_NAME, updates);
    return;
  }

  ensureUpdateFileExists();

  fs.writeFileSync(updateFilePath, JSON.stringify(updates, null, 2), "utf-8");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   UPDATE COMMAND
========================= */

function isUpdateCommand(message) {
  const text = normalizeText(message);

  return (
    text.startsWith("update ") ||
    text.startsWith("ubah ") ||
    text.startsWith("ganti ") ||
    text.startsWith("perbarui ")
  );
}

function parseUpdateCommand(message) {
  const originalMessage = String(message || "").trim();

  const patterns = [
    /^update\s+(.+?)\s+jadi\s+(.+)$/i,
    /^ubah\s+(.+?)\s+jadi\s+(.+)$/i,
    /^ganti\s+(.+?)\s+jadi\s+(.+)$/i,
    /^perbarui\s+(.+?)\s+jadi\s+(.+)$/i,
    /^update\s+(.+?)\s+menjadi\s+(.+)$/i,
    /^ubah\s+(.+?)\s+menjadi\s+(.+)$/i,
    /^ganti\s+(.+?)\s+menjadi\s+(.+)$/i,
    /^perbarui\s+(.+?)\s+menjadi\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = originalMessage.match(pattern);

    if (match) {
      return {
        topic: normalizeText(match[1]),
        value: match[2].trim(),
        originalMessage
      };
    }
  }

  return null;
}

async function createUpdate(message) {
  const parsed = parseUpdateCommand(message);

  if (!parsed) {
    return {
      success: false,
      message:
        "Format update belum sesuai.\n\nContoh:\nupdate pendaftaran TA jadi 17 Januari 2026\nubah NIP dosen Alifiansyah menjadi 22960063"
    };
  }

  const updates = await readUpdates();

  const newUpdate = {
    id: `update-${Date.now()}`,
    topic: parsed.topic,
    value: parsed.value,
    originalMessage: parsed.originalMessage,
    createdAt: new Date().toISOString()
  };

  updates.push(newUpdate);
  await saveUpdates(updates);

  return {
    success: true,
    data: newUpdate,
    message: `Data berhasil diperbarui.

Topik: ${parsed.topic}
Nilai baru: ${parsed.value}`
  };
}

/* =========================
   RESET COMMAND
========================= */

function isResetCommand(message) {
  const text = normalizeText(message);

  return (
    text.startsWith("reset ") ||
    text.startsWith("hapus update ") ||
    text.startsWith("hapus semua update") ||
    text.startsWith("batalkan update ")
  );
}

function parseResetCommand(message) {
  const originalMessage = String(message || "").trim();
  const text = normalizeText(originalMessage);

  if (
    text === "reset semua update" ||
    text === "reset update semua" ||
    text === "hapus semua update" ||
    text === "hapus update semua" ||
    text === "reset database update" ||
    text === "reset knowledge update"
  ) {
    return {
      type: "all",
      topic: "semua update",
      originalMessage
    };
  }

  const patterns = [
    /^reset\s+update\s+(.+)$/i,
    /^reset\s+(.+)$/i,
    /^hapus\s+update\s+(.+)$/i,
    /^batalkan\s+update\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = originalMessage.match(pattern);

    if (match) {
      return {
        type: "topic",
        topic: normalizeText(match[1]),
        originalMessage
      };
    }
  }

  return null;
}

async function resetUpdates(message) {
  const parsed = parseResetCommand(message);

  if (!parsed) {
    return {
      success: false,
      message:
        "Format reset belum sesuai.\n\nContoh:\nreset update pendaftaran TA\nreset update NIP dosen alifiansyah\nreset semua update"
    };
  }

  const updates = await readUpdates();

  if (parsed.type === "all") {
    await saveUpdates([]);

    return {
      success: true,
      message: "Semua data update berhasil direset."
    };
  }

  const topic = normalizeText(parsed.topic);
  const topicWords = topic.split(" ").filter((word) => word.length > 2);

  const remainingUpdates = updates.filter((item) => {
    const itemTopic = normalizeText(item.topic);
    const itemValue = normalizeText(item.value);
    const itemOriginal = normalizeText(item.originalMessage);

    const combined = `${itemTopic} ${itemValue} ${itemOriginal}`;

    const exactMatch =
      itemTopic.includes(topic) ||
      topic.includes(itemTopic) ||
      combined.includes(topic);

    const wordMatch = topicWords.some((word) => combined.includes(word));

    return !(exactMatch || wordMatch);
  });

  const deletedCount = updates.length - remainingUpdates.length;

  if (deletedCount === 0) {
    return {
      success: false,
      message: `Tidak ada data update yang cocok untuk topik: ${parsed.topic}`
    };
  }

  await saveUpdates(remainingUpdates);

  return {
    success: true,
    message: `Data update berhasil direset.

Topik: ${parsed.topic}
Jumlah data yang dihapus: ${deletedCount}`
  };
}

/* =========================
   SEARCH UPDATE CONTEXT
========================= */

async function searchUpdates(message) {
  const text = normalizeText(message);
  const words = text.split(" ").filter((word) => word.length > 2);
  const updates = await readUpdates();

  const results = updates
    .map((item) => {
      const topic = normalizeText(item.topic);
      const value = normalizeText(item.value);
      const originalMessage = normalizeText(item.originalMessage);

      let score = 0;

      if (text.includes(topic)) {
        score += 20;
      }

      if (topic.includes(text)) {
        score += 15;
      }

      words.forEach((word) => {
        if (topic.includes(word)) {
          score += 5;
        }

        if (value.includes(word)) {
          score += 3;
        }

        if (originalMessage.includes(word)) {
          score += 3;
        }
      });

      return {
        ...item,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return results;
}

async function buildUpdateContext(message) {
  const results = await searchUpdates(message);

  if (!results.length) {
    return "";
  }

  return results
    .slice(0, 5)
    .map((item, index) => {
      return `Update terbaru ${index + 1}
Topik: ${item.topic}
Nilai terbaru: ${item.value}
Tanggal update: ${item.createdAt}
Perintah asli: ${item.originalMessage}`;
    })
    .join("\n\n");
}

module.exports = {
  isUpdateCommand,
  parseUpdateCommand,
  createUpdate,

  isResetCommand,
  parseResetCommand,
  resetUpdates,

  readUpdates,
  searchUpdates,
  buildUpdateContext
};