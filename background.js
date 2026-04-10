// background.js — Service worker (orchestration only; streaming runs in the summary page)

const RESTRICTED_SCHEMES = ["chrome:", "chrome-extension:", "about:", "edge:", "devtools:", "file:"];

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
