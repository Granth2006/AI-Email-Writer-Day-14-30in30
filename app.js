const form = document.getElementById("email-form");
const apiKeyEl = document.getElementById("apiKey");
const promptEl = document.getElementById("prompt");
const toneEl = document.getElementById("tone");
const lengthEl = document.getElementById("length");
const emailTypeEl = document.getElementById("emailType");
const audienceEl = document.getElementById("audience");
const generateBtn = document.getElementById("generate-btn");
const regenerateBtn = document.getElementById("regenerate-btn");
const formError = document.getElementById("form-error");
const promptCounter = document.getElementById("prompt-counter");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const subjectOutput = document.getElementById("subject-output");
const bodyOutput = document.getElementById("body-output");
const copySubjectBtn = document.getElementById("copy-subject");
const copyBodyBtn = document.getElementById("copy-body");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history");

const MAX_PROMPT_LENGTH = 1200;
const STORAGE_KEY = "ai-email-writer-history";
const API_KEY_STORAGE = "ai-email-writer-groq-key";
const HISTORY_LIMIT = 10;
let lastPayload = null;

function sanitizeApiKey(rawValue) {
  if (typeof rawValue !== "string") return "";
  // Remove invisible chars/newlines that commonly appear when pasting keys.
  const compact = rawValue
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  // Headers only allow ISO-8859-1 characters.
  return Array.from(compact)
    .filter((char) => char.charCodeAt(0) <= 255)
    .join("");
}

function updatePromptCounter() {
  promptCounter.textContent = `${promptEl.value.length} / ${MAX_PROMPT_LENGTH}`;
}

function getPayload(variationSeed = Date.now()) {
  return {
    apiKey: sanitizeApiKey(apiKeyEl.value),
    prompt: promptEl.value.trim(),
    tone: toneEl.value,
    length: lengthEl.value,
    emailType: emailTypeEl.value,
    audience: audienceEl.value.trim(),
    variationSeed
  };
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function renderHistory() {
  const history = readHistory();
  historyList.innerHTML = "";

  if (!history.length) {
    historyList.innerHTML = '<li class="history-empty">No history yet.</li>';
    return;
  }

  history.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "history-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<strong>${item.subject}</strong><br><small>${new Date(item.meta.createdAt).toLocaleString()}</small>`;
    btn.addEventListener("click", () => {
      renderResult(item);
      statusEl.textContent = `Loaded item ${index + 1} from history.`;
    });

    li.appendChild(btn);
    historyList.appendChild(li);
  });
}

function saveToHistory(item) {
  const history = readHistory();
  history.unshift(item);
  writeHistory(history);
  renderHistory();
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  regenerateBtn.disabled = isLoading || !lastPayload;
  generateBtn.textContent = isLoading ? "Generating..." : "Generate Email";
}

function showError(message) {
  formError.textContent = message;
  formError.classList.remove("hidden");
}

function clearError() {
  formError.classList.add("hidden");
  formError.textContent = "";
}

function validateForm(payload) {
  if (!payload.apiKey) {
    return "Groq API key is required.";
  }
  if (!payload.apiKey.startsWith("gsk_")) {
    return "Groq API key looks invalid. It should start with gsk_.";
  }
  if (!payload.prompt) {
    return "Prompt is required.";
  }
  if (payload.prompt.length > MAX_PROMPT_LENGTH) {
    return `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`;
  }
  return "";
}

function renderResult(result) {
  subjectOutput.textContent = result.subject;
  bodyOutput.textContent = result.body;
  resultEl.classList.remove("hidden");
}

function buildMessages(payload) {
  const safeAudience = payload.audience || "general professional audience";
  const systemContent = [
    "You are an expert executive assistant who writes polished business emails.",
    "Return strict JSON only with this exact schema:",
    '{ "subject": "string", "body": "string" }',
    "The body should be plain text paragraphs.",
    "Keep tone and length constraints exactly as requested."
  ].join(" ");

  const userContent = [
    `Task: Draft a professional ${payload.emailType} email.`,
    `Prompt/context: ${payload.prompt}`,
    `Audience: ${safeAudience}.`,
    `Tone: ${payload.tone}.`,
    `Length: ${payload.length}.`,
    `Variation seed: ${payload.variationSeed}.`,
    "Write a clear subject and coherent body with a strong close."
  ].join(" ");

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent }
  ];
}

function parseModelContent(rawText, payload) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response was not valid JSON.");
    }
    parsed = JSON.parse(rawText.slice(start, end + 1));
  }

  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!subject || !body) {
    throw new Error("Model response missing subject or body.");
  }

  return {
    subject,
    body,
    meta: {
      tone: payload.tone,
      length: payload.length,
      emailType: payload.emailType,
      audience: payload.audience || "",
      createdAt: new Date().toISOString()
    }
  };
}

async function generateEmail(payload) {
  clearError();
  const validationMessage = validateForm(payload);
  if (validationMessage) {
    showError(validationMessage);
    return;
  }

  setLoading(true);
  statusEl.textContent = "Generating email...";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: buildMessages(payload)
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || data?.error || "Generation failed.";
      throw new Error(message);
    }

    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") {
      throw new Error("No content returned by Groq.");
    }

    const normalized = parseModelContent(rawContent, payload);
    renderResult(normalized);
    saveToHistory(normalized);
    statusEl.textContent = "Email generated successfully.";
    lastPayload = { ...payload };
    delete lastPayload.apiKey;
    regenerateBtn.disabled = false;
  } catch (error) {
    showError(error.message || "Something went wrong.");
    statusEl.textContent = "Could not generate email.";
  } finally {
    setLoading(false);
  }
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const previous = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  } catch {
    showError("Clipboard permission denied. Please copy manually.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateEmail(getPayload());
});

regenerateBtn.addEventListener("click", async () => {
  if (!lastPayload) return;
  await generateEmail({
    ...lastPayload,
    apiKey: apiKeyEl.value.trim(),
    variationSeed: Date.now()
  });
});

promptEl.addEventListener("input", updatePromptCounter);

copySubjectBtn.addEventListener("click", () => {
  if (!subjectOutput.textContent) return;
  copyToClipboard(subjectOutput.textContent, copySubjectBtn);
});

copyBodyBtn.addEventListener("click", () => {
  if (!bodyOutput.textContent) return;
  copyToClipboard(bodyOutput.textContent, copyBodyBtn);
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  statusEl.textContent = "History cleared.";
});

apiKeyEl.value = localStorage.getItem(API_KEY_STORAGE) || "";
apiKeyEl.addEventListener("input", () => {
  const sanitized = sanitizeApiKey(apiKeyEl.value);
  if (apiKeyEl.value !== sanitized) {
    apiKeyEl.value = sanitized;
  }
  localStorage.setItem(API_KEY_STORAGE, sanitized);
});

updatePromptCounter();
renderHistory();
