// providers/anthropic.js — Anthropic Messages API + SSE streaming

/**
 * @param {object} config - { apiKey, baseUrl, model, maxTokens }
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {AsyncIterable<string>}
 */
async function* anthropicStream(config, systemPrompt, userMessage, state) {
  const url = `${config.baseUrl || "https://api.anthropic.com"}/v1/messages`;

  const body = {
    model: config.model || "claude-sonnet-4-6",
    max_tokens: config.maxTokens || 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    stream: true,
    thinking: { type: "disabled" },
  };

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Anthropic API error (${response.status}): ${errorMessage}`);
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
      if (data === "[DONE]") return;

      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.text) {
          yield event.delta.text;
        } else if (event.type === "message_delta" && event.delta?.stop_reason) {
          state.stopReason = event.delta.stop_reason;
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}
