// providers/openai.js — OpenAI-compatible /chat/completions + SSE streaming

/**
 * @param {object} config - { apiKey, baseUrl, model, maxTokens }
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {AsyncIterable<string>}
 */
async function* openaiStream(config, systemPrompt, userMessage, state) {
  const url = `${config.baseUrl || "https://api.openai.com/v1"}/chat/completions`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const body = {
    model: config.model || "gpt-4o-mini",
    messages,
    stream: true,
  };

  if (config.maxTokens) {
    body.max_tokens = config.maxTokens;
  }

  const headers = {
    "Content-Type": "application/json",
  };

  // Allow empty API key for local servers
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

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
    throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
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
        const choice = event.choices?.[0];
        const content = choice?.delta?.content;
        if (content) {
          yield content;
        }
        if (choice?.finish_reason) {
          state.stopReason = choice.finish_reason;
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}
