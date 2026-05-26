const dashboardPage = document.getElementById("dashboardPage");
const chatPage = document.getElementById("chatPage");

const openChatTop = document.getElementById("openChatTop");
const openChatHero = document.getElementById("openChatHero");
const backDashboard = document.getElementById("backDashboard");

const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");

const clickableButtons = document.querySelectorAll(
  ".service-item, .suggestion-row button, .service-card"
);

let hasOpenedChat = false;

function openChat(initialMessage = null) {
  dashboardPage.classList.add("hidden");
  chatPage.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  if (!hasOpenedChat) {
    createMessage(
`Halo! 👋
Selamat datang di LAA Akademik Bot.

Saya siap membantu informasi seputar:
• Kalender akademik
• Registrasi, perwalian, dan PRS
• SKS, IPS, IPK, dan nilai
• Tugas akhir / skripsi
• Yudisium dan wisuda
• Data dosen
• Jadwal kuliah

Silakan pilih layanan di sebelah kiri, gunakan tombol cepat, atau langsung tulis pertanyaan kamu.`,
      "bot"
    );

    createInlineMenu();
    hasOpenedChat = true;
  }

  if (initialMessage) {
    setTimeout(() => sendMessage(initialMessage), 250);
  }
}

function goDashboard() {
  chatPage.classList.add("hidden");
  dashboardPage.classList.remove("hidden");
  document.body.style.overflow = "auto";
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createMessage(text, sender = "bot") {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  if (sender === "user") {
    meta.textContent = `Anda • ${getCurrentTime()}`;
  } else if (sender === "loading") {
    meta.textContent = "LAA Akademik Bot sedang mencari informasi...";
  } else {
    meta.textContent = `LAA Akademik Bot • ${getCurrentTime()}`;
  }

  row.appendChild(bubble);
  row.appendChild(meta);

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;

  return row;
}

function createTypingMessage() {
  const row = document.createElement("div");
  row.className = "message-row loading";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  bubble.innerHTML = `
    <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = "LAA Akademik Bot sedang mengetik...";

  row.appendChild(bubble);
  row.appendChild(meta);

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;

  return row;
}

function createInlineMenu() {
  const wrapper = document.createElement("div");
  wrapper.className = "inline-menu";

  const menus = [
    ["Kalender Akademik", "1"],
    ["Pedoman Akademik", "2"],
    ["SKS / IPS / IPK", "3"],
    ["Tugas Akhir", "4"],
    ["Yudisium / Wisuda", "5"],
    ["Data Dosen", "6"],
    ["Jadwal Kuliah", "7"]
  ];

  menus.forEach(([label, value]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;

    btn.addEventListener("click", () => {
      sendMessage(value);
    });

    wrapper.appendChild(btn);
  });

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage(message) {
  const cleanMessage = String(message || "").trim();

  if (!cleanMessage) {
    return;
  }

  createMessage(cleanMessage, "user");
  userInput.value = "";

  const loadingRow = createTypingMessage();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: cleanMessage
      })
    });

    const data = await response.json();

    loadingRow.remove();

    if (data.success) {
      createMessage(data.answer, "bot");

      const lower = cleanMessage.toLowerCase();

      if (
        lower === "menu" ||
        lower === "halo" ||
        lower === "hai" ||
        lower === "hallo" ||
        lower === "hello"
      ) {
        createInlineMenu();
      }
    } else {
      createMessage(
        data.answer || "Maaf, terjadi kendala saat memproses pesan.",
        "bot"
      );
    }
  } catch (error) {
    console.error("Fetch Error:", error);

    loadingRow.remove();

    createMessage(
      "Tidak dapat terhubung ke server. Pastikan server sudah berjalan dengan benar.",
      "bot"
    );
  }
}

openChatTop.addEventListener("click", () => openChat());
openChatHero.addEventListener("click", () => openChat());
backDashboard.addEventListener("click", goDashboard);

chatForm.addEventListener("submit", function (event) {
  event.preventDefault();
  sendMessage(userInput.value);
});

clickableButtons.forEach((button) => {
  button.addEventListener("click", function () {
    const message = button.getAttribute("data-message");

    if (dashboardPage && !dashboardPage.classList.contains("hidden")) {
      openChat(message);
    } else {
      sendMessage(message);
    }
  });
});