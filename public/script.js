const menuToggle = document.getElementById("menuToggle");
const mobileMenu = document.getElementById("mobileMenu");

const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");

const quickQuestionButtons = document.querySelectorAll(".quick-question-btn");

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", function () {
    mobileMenu.classList.toggle("active");
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMessage(sender, text) {
  if (!chatMessages) return;

  const messageWrapper = document.createElement("div");
  messageWrapper.className =
    sender === "user" ? "message user-message" : "message bot-message";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");

  messageWrapper.appendChild(bubble);
  chatMessages.appendChild(messageWrapper);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
  if (!chatMessages) return null;

  const typingId = `typing-${Date.now()}`;

  const messageWrapper = document.createElement("div");
  messageWrapper.className = "message bot-message";
  messageWrapper.id = typingId;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble typing-bubble";
  bubble.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  messageWrapper.appendChild(bubble);
  chatMessages.appendChild(messageWrapper);

  chatMessages.scrollTop = chatMessages.scrollHeight;

  return typingId;
}

function removeTypingIndicator(id) {
  if (!id) return;

  const element = document.getElementById(id);

  if (element) {
    element.remove();
  }
}

function setLoading(isLoading) {
  if (!sendButton || !userInput) return;

  sendButton.disabled = isLoading;
  userInput.disabled = isLoading;
  sendButton.textContent = isLoading ? "..." : "Kirim";
}

async function sendMessage(messageText) {
  const message = String(messageText || userInput?.value || "").trim();

  if (!message) return;

  addMessage("user", message);

  if (userInput) {
    userInput.value = "";
  }

  setLoading(true);

  const typingId = addTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message
      })
    });

    let data = {};

    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    removeTypingIndicator(typingId);

    if (!response.ok) {
      addMessage(
        "bot",
        data.answer ||
          data.message ||
          "Maaf, terjadi kendala pada server chatbot."
      );
      return;
    }

    addMessage(
      "bot",
      data.answer ||
        data.response ||
        data.message ||
        "Maaf, aku belum bisa menjawab pertanyaan tersebut."
    );
  } catch (error) {
    removeTypingIndicator(typingId);

    console.error("Chat Error:", error);

    addMessage(
      "bot",
      "Maaf, chatbot belum dapat terhubung ke server. Pastikan server backend sudah berjalan."
    );
  } finally {
    setLoading(false);

    if (userInput) {
      userInput.focus();
    }
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });
}

quickQuestionButtons.forEach((button) => {
  button.addEventListener("click", function () {
    const question = button.getAttribute("data-question");

    if (question) {
      sendMessage(question);
    }
  });
});