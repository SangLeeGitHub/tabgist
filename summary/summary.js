// summary/summary.js

const titleEl = document.getElementById("title");
const urlEl = document.getElementById("sourceUrl");
const actionsEl = document.getElementById("actions");
const contentEl = document.getElementById("content");
const btnRegenerate = document.getElementById("btnRegenerate");
const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnClose = document.getElementById("btnClose");

let currentData = null;
let fullSummary = "";

function showLoading(message) {
  contentEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

function getOwnTabId() {
  return new Promise((resolve) => {
    chrome.tabs.getCurrent((tab) => resolve(tab.id));
  });
}

function renderMarkdown(text) {
  // Minimal markdown → HTML
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Bullet points
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    // Paragraphs: double newline
    .replace(/\n\n/g, "</p><p>")
    // Single newline
    .replace(/\n/g, "<br>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li>(?:<br>)?)+)/g, "<ul>$1</ul>");

  return `<p>${html}</p>`;
}

function showError(title, message) {
  titleEl.textContent = title || "Error";
  urlEl.style.display = "none";
  contentEl.innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function showNoKey() {
  titleEl.textContent = "API Key Required";
  urlEl.style.display = "none";
  contentEl.innerHTML = `
    <div class="no-key">
      <h2>Set up your API key</h2>
      <p>To start summarizing pages, configure your API key in the extension options.</p>
      <button class="btn btn-primary" id="btnOpenOptions">Open Options</button>
    </div>
  `;
  document.getElementById("btnOpenOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

async function startStreaming(data) {
  currentData = data;
  fullSummary = "";

  // Update header
  titleEl.textContent = data.title || "Untitled";
  urlEl.textContent = data.url;
  urlEl.href = data.url;
  urlEl.style.display = "";
  actionsEl.style.display = "flex";

  // Set up streaming container ONCE before the loop (same as original working code)
  // Show "Generating summary..." as initial content until first token arrives
  contentEl.innerHTML = '<div class="streaming-cursor" id="streamText"><div class="loading"><div class="spinner"></div><p>Generating summary...</p></div></div>';
  const streamText = document.getElementById("streamText");

  const streamStartTime = performance.now();
  let firstTokenTime = 0;
  let chunkCount = 0;

  try {
    const provider = getProvider(data.config);

    for await (const chunk of provider.summarize(data.title, data.url, data.body)) {
      // First token — record thinking time
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
      }

      fullSummary += chunk;
      chunkCount++;
      streamText.innerHTML = renderMarkdown(fullSummary);
      streamText.className = "streaming-cursor rendered";
    }

    // Done streaming — remove cursor, show stats
    const streamEndTime = performance.now();
    streamText.className = "rendered";

    // Stats
    const totalTime = ((streamEndTime - streamStartTime) / 1000).toFixed(1);
    const firstRespTime = firstTokenTime ? ((firstTokenTime - streamStartTime) / 1000).toFixed(1) : "—";
    const genTime = firstTokenTime ? ((streamEndTime - firstTokenTime) / 1000) : 0;
    const tps = genTime > 0 ? (chunkCount / genTime).toFixed(1) : "—";

    // Check if output was truncated
    const truncated = (provider.state.stopReason === "max_tokens" || provider.state.stopReason === "length");
    const warnHtml = truncated
      ? `<div class="stats" style="color:var(--error);">⚠ Output truncated (max_tokens reached). Increase Max Tokens in settings.</div>`
      : "";

    const statsHtml = `
      <div class="stats">
        ⏱ Thinking: ${firstRespTime}s · Total: ${totalTime}s · Speed: ${tps} t/s
      </div>
      ${warnHtml}
    `;
    contentEl.insertAdjacentHTML("beforeend", statsHtml);

  } catch (err) {
    // Preserve partial output if any exists
    if (fullSummary) {
      streamText.className = "rendered";
      contentEl.insertAdjacentHTML("beforeend", `
        <div class="error-state">
          <p>${err.message}</p>
          <button class="btn btn-primary" id="btnRetry">Retry</button>
        </div>
      `);
    } else {
      contentEl.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h2>Summary Failed</h2>
          <p>${err.message}</p>
          <button class="btn btn-primary" id="btnRetry">Retry</button>
        </div>
      `;
    }
    document.getElementById("btnRetry")?.addEventListener("click", () => {
      startStreaming(data);
    });
  }
}

async function init() {
  const tabId = await getOwnTabId();
  const key = `summary_${tabId}`;

  // Phase 1: Analyzing page...
  showLoading("Analyzing page...");

  // Poll for data — the background script may still be extracting
  let data = null;
  for (let i = 0; i < 30; i++) {
    const result = await chrome.storage.session.get(key);
    data = result[key];
    if (data && data.status !== "loading") break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!data) {
    showError("No Data", "No page data received. Try clicking the extension icon again.");
    return;
  }

  if (data.status === "no-key") {
    titleEl.textContent = data.title || "Untitled";
    urlEl.textContent = data.url;
    urlEl.href = data.url;
    showNoKey();
    return;
  }

  if (data.status === "error") {
    showError("Error", data.error);
    if (data.title) titleEl.textContent = data.title;
    if (data.url) {
      urlEl.textContent = data.url;
      urlEl.href = data.url;
      urlEl.style.display = "";
    }
    return;
  }

  if (data.status === "ready") {
    await startStreaming(data);
    return;
  }

  // Still loading — keep waiting
  titleEl.textContent = data.title || "Loading…";
  if (data.url) {
    urlEl.textContent = data.url;
    urlEl.href = data.url;
  }
}

// Button handlers
btnRegenerate.addEventListener("click", () => {
  if (currentData) startStreaming(currentData);
});

btnCopy.addEventListener("click", async () => {
  if (fullSummary) {
    await navigator.clipboard.writeText(fullSummary);
    btnCopy.textContent = "✓ Copied";
    setTimeout(() => {
      btnCopy.textContent = "📋 Copy";
    }, 2000);
  }
});

btnOpen.addEventListener("click", () => {
  if (currentData?.url) {
    window.open(currentData.url, "_blank");
  }
});

btnClose.addEventListener("click", () => {
  window.close();
});

init();
