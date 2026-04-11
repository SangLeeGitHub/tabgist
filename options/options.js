// options/options.js

const PRESETS = {
  anthropic: {
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
  },
  openai: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  lmstudio: {
    provider: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    model: "",
  },
  llamacpp: {
    provider: "openai-compatible",
    baseUrl: "http://localhost:8080/v1",
    model: "",
  },
  ollama: {
    provider: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    model: "",
  },
  openrouter: {
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "",
  },
  zai: {
    provider: "openai-compatible",
    baseUrl: "https://api.z.ai/api/paas/v4",
    model: "glm-5.1",
  },
};

const $ = (id) => document.getElementById(id);

const els = {
  preset: $("preset"),
  provider: $("provider"),
  anthropicKey: $("anthropicKey"),
  openaiKey: $("openaiKey"),
  baseUrl: $("baseUrl"),
  model: $("model"),
  systemPrompt: $("systemPrompt"),
  useMaxCompletionTokens: $("useMaxCompletionTokens"),
  maxTokens: $("maxTokens"),
  language: $("language"),
  btnSave: $("btnSave"),
  btnTest: $("btnTest"),
  btnResetPrompt: $("btnResetPrompt"),
  testResult: $("testResult"),
  toast: $("toast"),
};

const DEFAULT_SYSTEM_PROMPT = "You summarize web pages concisely. Output format: 1) A 'Summary' section with 3-5 sentences, 2) A 'Key Points' section with 5-8 bullets. Write the summary in the same language as the source page.";

// Load saved settings
async function loadSettings() {
  const syncData = await chrome.storage.sync.get([
    "provider",
    "baseUrl",
    "model",
    "maxTokens",
    "language",
    "systemPrompt",
    "useMaxCompletionTokens",
  ]);
  const localData = await chrome.storage.local.get(["anthropicApiKey", "openaiApiKey"]);

  if (syncData.provider) els.provider.value = syncData.provider;
  if (syncData.baseUrl) els.baseUrl.value = syncData.baseUrl;
  if (syncData.model) els.model.value = syncData.model;
  if (syncData.maxTokens) els.maxTokens.value = syncData.maxTokens;
  if (syncData.language) els.language.value = syncData.language;
  els.systemPrompt.value = syncData.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  if (syncData.useMaxCompletionTokens) els.useMaxCompletionTokens.checked = true;
  if (localData.anthropicApiKey) els.anthropicKey.value = localData.anthropicApiKey;
  if (localData.openaiApiKey) els.openaiKey.value = localData.openaiApiKey;

  // Set placeholder defaults
  updatePlaceholders();
}

function updatePlaceholders() {
  const provider = els.provider.value;
  if (provider === "anthropic") {
    els.baseUrl.placeholder = "https://api.anthropic.com";
    els.model.placeholder = "claude-sonnet-4-6";
  } else {
    els.baseUrl.placeholder = "https://api.openai.com/v1";
    els.model.placeholder = "gpt-4o-mini";
  }
}

// Save settings
async function saveSettings() {
  const provider = els.provider.value;
  const syncData = {
    provider,
    baseUrl: els.baseUrl.value.trim(),
    model: els.model.value.trim(),
    maxTokens: parseInt(els.maxTokens.value, 10) || 2048,
    systemPrompt: els.systemPrompt.value.trim(),
    useMaxCompletionTokens: els.useMaxCompletionTokens.checked,
    language: els.language.value,
  };

  // Ensure baseUrl has a value
  if (!syncData.baseUrl) {
    syncData.baseUrl = provider === "anthropic"
      ? "https://api.anthropic.com"
      : "https://api.openai.com/v1";
  }

  await chrome.storage.sync.set(syncData);

  // API keys in local storage
  const localData = {};
  if (els.anthropicKey.value.trim()) {
    localData.anthropicApiKey = els.anthropicKey.value.trim();
  } else {
    localData.anthropicApiKey = "";
  }
  if (els.openaiKey.value.trim()) {
    localData.openaiApiKey = els.openaiKey.value.trim();
  } else {
    localData.openaiApiKey = "";
  }
  await chrome.storage.local.set(localData);

  showToast("Settings saved!", "success");
}

// Test connection
async function testConnection() {
  const provider = els.provider.value;
  const apiKey = provider === "anthropic"
    ? els.anthropicKey.value.trim()
    : els.openaiKey.value.trim();
  const baseUrl = els.baseUrl.value.trim() || (provider === "anthropic"
    ? "https://api.anthropic.com"
    : "https://api.openai.com/v1");
  const model = els.model.value.trim() || (provider === "anthropic"
    ? "claude-sonnet-4-6"
    : "gpt-4o-mini");

  els.testResult.className = "test-result";
  els.testResult.textContent = "Testing connection…";
  els.testResult.className = "test-result show";
  els.btnTest.disabled = true;

  try {
    if (provider === "anthropic") {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 32,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      if (response.ok) {
        els.testResult.className = "test-result show success";
        els.testResult.textContent = "Connection successful!";
      } else {
        const text = await response.text();
        let msg;
        try {
          const json = JSON.parse(text);
          msg = json.error?.message || text;
        } catch {
          msg = text;
        }
        els.testResult.className = "test-result show error";
        els.testResult.textContent = `Error (${response.status}): ${msg}`;
      }
    } else {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 32,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      if (response.ok) {
        els.testResult.className = "test-result show success";
        els.testResult.textContent = "Connection successful!";
      } else {
        const text = await response.text();
        let msg;
        try {
          const json = JSON.parse(text);
          msg = json.error?.message || text;
        } catch {
          msg = text;
        }
        els.testResult.className = "test-result show error";
        els.testResult.textContent = `Error (${response.status}): ${msg}`;
      }
    }
  } catch (err) {
    els.testResult.className = "test-result show error";
    els.testResult.textContent = `Connection failed: ${err.message}`;
  }

  els.btnTest.disabled = false;
}

// Toast
function showToast(message, type) {
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  setTimeout(() => {
    els.toast.className = "toast";
  }, 2500);
}

// Preset loader
els.preset.addEventListener("change", () => {
  const preset = PRESETS[els.preset.value];
  if (!preset) return;

  els.provider.value = preset.provider;
  els.baseUrl.value = preset.baseUrl;
  els.model.value = preset.model;
  updatePlaceholders();

  // Reset preset dropdown
  els.preset.value = "";
});

// Provider change updates placeholders
els.provider.addEventListener("change", updatePlaceholders);

// Button handlers
els.btnSave.addEventListener("click", saveSettings);
els.btnTest.addEventListener("click", testConnection);
els.btnResetPrompt.addEventListener("click", () => {
  els.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
});

// Init
loadSettings();
