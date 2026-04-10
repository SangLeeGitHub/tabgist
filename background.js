// background.js — Service worker
// All streaming logic is self-contained here (no importScripts dependency).

const RESTRICTED_SCHEMES = ["chrome:", "chrome-extension:", "about:", "edge:", "devtools:", "file:"];

const LANGUAGE_MAP = {
  auto: null, ko: "Korean", en: "English", ja: "Japanese",
  zh: "Chinese", es: "Spanish", fr: "French", de: "German",
};

function buildSystemPrompt(languageCode) {
  const langName = LANGUAGE_MAP[languageCode];
  if (!langName) {
    return "You summarize web pages concisely. Output format: 1) A 'Summary' section with 3-5 sentences, 2) A 'Key Points' section with 5-8 bullets. Write the summary in the same language as the source page.";
  }
  return `You summarize web pages concisely. Output format: 1) A 'Summary' section with 3-5 sentences, 2) A 'Key Points' section with 5-8 bullets. Write the summary in ${langName} regardless of the source language.`;
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

async function getConfig() {
  const syncData = await chrome.storage.sync.get([
    "provider", "baseUrl", "model", "maxTokens", "language",
  ]);
  const localData = await chrome.storage.local.get(["anthropicApiKey", "openaiApiKey"]);
  const provider = syncData.provider || "anthropic";
  return {
    provider,
    baseUrl: syncData.baseUrl || (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
    model: syncData.model || (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o-mini"),
    maxTokens: syncData.maxTokens || 2048,
    language: syncData.language || "auto",
    apiKey: provider === "anthropic" ? localData.anthropicApiKey : localData.openaiApiKey,
  };
}

async function extractPageContent(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/Readability.js"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "extract" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// ── Streaming: fetch + SSE parsing, runs entirely in the service worker ──

async function streamToTab(config, title, url, body, tabId) {
  const systemPrompt = buildSystemPrompt(config.language || "auto");
  const userMessage = `Title: ${title}\nURL: ${url}\n\n${body}`;
  let stopReason = null;

  let fetchUrl, fetchHeaders, fetchBody;

  if (config.provider === "anthropic") {
    fetchUrl = `${config.baseUrl || "https://api.anthropic.com"}/v1/messages`;
    fetchHeaders = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    fetchBody = JSON.stringify({
      model: config.model || "claude-sonnet-4-6",
      max_tokens: config.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      stream: true,
    });
  } else {
    fetchUrl = `${config.baseUrl || "https://api.openai.com/v1"}/chat/completions`;
    fetchHeaders = { "Content-Type": "application/json" };
    if (config.apiKey) fetchHeaders["Authorization"] = `Bearer ${config.apiKey}`;
    fetchBody = JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
      ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
    });
  }

  const response = await fetch(fetchUrl, { method: "POST", headers: fetchHeaders, body: fetchBody });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try { errorMessage = JSON.parse(errorText).error?.message || errorText; } catch { errorMessage = errorText; }
    throw new Error(`API error (${response.status}): ${errorMessage}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);

        if (config.provider === "anthropic") {
          if (event.type === "content_block_delta" && event.delta?.text) {
            chrome.tabs.sendMessage(tabId, { type: "stream-chunk", text: event.delta.text });
          } else if (event.type === "message_delta" && event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        } else {
          const choice = event.choices?.[0];
          if (choice?.delta?.content) {
            chrome.tabs.sendMessage(tabId, { type: "stream-chunk", text: choice.delta.content });
          }
          if (choice?.finish_reason) {
            stopReason = choice.finish_reason;
          }
        }
      } catch { /* skip malformed JSON */ }
    }
  }

  chrome.tabs.sendMessage(tabId, { type: "stream-done", stopReason });
}

// ── Event listeners ──

chrome.action.onClicked.addListener(async (tab) => {
  if (isRestrictedUrl(tab.url)) {
    const summaryTab = await chrome.tabs.create({ url: chrome.runtime.getURL("summary/summary.html") });
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error",
        error: "Cannot summarize this page. Chrome internal pages are not accessible.",
        title: tab.title || "", url: tab.url || "",
      },
    });
    return;
  }

  const config = await getConfig();

  if (config.provider === "anthropic" && !config.apiKey) {
    const summaryTab = await chrome.tabs.create({ url: chrome.runtime.getURL("summary/summary.html") });
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: { status: "no-key", title: tab.title || "", url: tab.url || "" },
    });
    return;
  }

  const summaryTab = await chrome.tabs.create({ url: chrome.runtime.getURL("summary/summary.html") });

  await chrome.storage.session.set({
    [`summary_${summaryTab.id}`]: { status: "loading", title: tab.title || "", url: tab.url || "" },
  });

  const result = await extractPageContent(tab.id);

  if (!result || !result.success) {
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error", error: result?.error || "Failed to extract page content.",
        title: tab.title || "", url: tab.url || "",
      },
    });
    return;
  }

  const { title, body, url } = result.data;

  if (!body || body.trim().length < 50) {
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error", error: "This page does not have enough text content to summarize.",
        title: title || "", url: url || "",
      },
    });
    return;
  }

  await chrome.storage.session.set({
    [`summary_${summaryTab.id}`]: { status: "ready", title, url, body, config },
  });
});

// Streaming handler — summary page triggers this, fetch runs in service worker (no CORS issues)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "start-stream") return false;

  const { config, title, url, body } = msg;
  const tabId = sender.tab.id;

  sendResponse({ started: true });

  streamToTab(config, title, url, body, tabId).catch((err) => {
    chrome.tabs.sendMessage(tabId, { type: "stream-error", message: err.message });
  });

  return false;
});
