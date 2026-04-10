// background.js — Service worker
// Provider modules loaded for streaming via port messaging (avoids CORS/Origin issues).

importScripts("providers/anthropic.js", "providers/openai.js", "providers/index.js");

const RESTRICTED_SCHEMES = ["chrome:", "chrome-extension:", "about:", "edge:", "devtools:", "file:"];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

async function getConfig() {
  const syncData = await chrome.storage.sync.get([
    "provider",
    "baseUrl",
    "model",
    "maxTokens",
    "language",
  ]);

  // API keys stored in local storage for security
  const localData = await chrome.storage.local.get(["anthropicApiKey", "openaiApiKey"]);

  const provider = syncData.provider || "anthropic";

  const config = {
    provider,
    baseUrl: syncData.baseUrl || (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
    model: syncData.model || (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o-mini"),
    maxTokens: syncData.maxTokens || 2048,
    language: syncData.language || "auto",
    apiKey: provider === "anthropic" ? localData.anthropicApiKey : localData.openaiApiKey,
  };

  return config;
}

async function extractPageContent(tabId) {
  // Inject Readability first
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/Readability.js"],
  });

  // Then inject content script
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  // Send extraction message
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

chrome.action.onClicked.addListener(async (tab) => {
  if (isRestrictedUrl(tab.url)) {
    // Cannot inject into restricted pages — open a summary tab with an error
    const summaryTab = await chrome.tabs.create({
      url: chrome.runtime.getURL("summary/summary.html"),
    });
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error",
        error: "Cannot summarize this page. Chrome internal pages are not accessible.",
        title: tab.title || "",
        url: tab.url || "",
      },
    });
    return;
  }

  // Check for API key config
  const config = await getConfig();

  // Anthropic requires an API key; OpenAI-compatible may work without one (local servers)
  if (config.provider === "anthropic" && !config.apiKey) {
    const summaryTab = await chrome.tabs.create({
      url: chrome.runtime.getURL("summary/summary.html"),
    });
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "no-key",
        title: tab.title || "",
        url: tab.url || "",
      },
    });
    return;
  }

  // Open summary tab immediately
  const summaryTab = await chrome.tabs.create({
    url: chrome.runtime.getURL("summary/summary.html"),
  });

  // Set loading state
  await chrome.storage.session.set({
    [`summary_${summaryTab.id}`]: {
      status: "loading",
      title: tab.title || "",
      url: tab.url || "",
    },
  });

  // Extract content from the source tab
  const result = await extractPageContent(tab.id);

  if (!result || !result.success) {
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error",
        error: result?.error || "Failed to extract page content.",
        title: tab.title || "",
        url: tab.url || "",
      },
    });
    return;
  }

  const { title, body, url } = result.data;

  if (!body || body.trim().length < 50) {
    await chrome.storage.session.set({
      [`summary_${summaryTab.id}`]: {
        status: "error",
        error: "This page does not have enough text content to summarize.",
        title: title || "",
        url: url || "",
      },
    });
    return;
  }

  // Store extracted data and config for the summary page to use
  await chrome.storage.session.set({
    [`summary_${summaryTab.id}`]: {
      status: "ready",
      title,
      url,
      body,
      config,
    },
  });
});

// Streaming handler — summary page sends message, service worker makes the API call (no CORS/Origin issues)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "start-stream") return false;

  const { config, title, url, body } = msg;
  const tabId = sender.tab.id;

  sendResponse({ started: true });

  (async () => {
    try {
      const provider = getProvider(config);

      for await (const chunk of provider.summarize(title, url, body)) {
        chrome.tabs.sendMessage(tabId, { type: "stream-chunk", text: chunk });
      }

      chrome.tabs.sendMessage(tabId, { type: "stream-done", stopReason: provider.state.stopReason });
    } catch (err) {
      chrome.tabs.sendMessage(tabId, { type: "stream-error", message: err.message });
    }
  })();

  return false;
});
