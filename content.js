// content.js — Readability-based content extraction

(function () {
  const MAX_LENGTH = 20000;

  function getMetaContent(name) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute("content") || "" : "";
  }

  function extractContent() {
    let title = document.title || "";
    let body = "";
    let description = getMetaContent("og:description") || getMetaContent("description") || "";

    try {
      // Clone the document so Readability doesn't modify the page
      const clone = document.cloneNode(true);
      const reader = new Readability(clone);
      const article = reader.parse();
      if (article && article.textContent) {
        body = article.textContent.trim();
        if (article.title) title = article.title;
      }
    } catch (_) {
      // Readability failed, fall back
    }

    if (!body) {
      body = (document.body.innerText || "").trim();
    }

    // Truncate
    const combined = `Title: ${title}\n\n${body}`;
    if (combined.length > MAX_LENGTH) {
      body = body.substring(0, MAX_LENGTH - title.length - 10);
    }

    return { title, body, description, url: location.href };
  }

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extract") {
      try {
        const data = extractContent();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    return true; // keep message channel open for async
  });
})();
