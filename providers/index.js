// providers/index.js — Common provider interface

const LANGUAGE_MAP = {
  auto: null,
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
};

function buildSystemPrompt(languageCode) {
  const langName = LANGUAGE_MAP[languageCode];

  if (!langName) {
    // Auto — follow the source page language
    return "You summarize web pages concisely. Output format: 1) A 'Summary' section with 3-5 sentences, 2) A 'Key Points' section with 5-8 bullets. Write the summary in the same language as the source page.";
  }

  return `You summarize web pages concisely. Output format: 1) A 'Summary' section with 3-5 sentences, 2) A 'Key Points' section with 5-8 bullets. Write the summary in ${langName} regardless of the source language.`;
}

/**
 * @param {object} config - { provider, apiKey, baseUrl, model, maxTokens, language }
 * @returns {{ summarize: (...) => AsyncIterable<string>, stopReason: string|null }}
 */
function getProvider(config) {
  const systemPrompt = buildSystemPrompt(config.language || "auto");
  const state = { stopReason: null };

  const summarize = async function* (title, url, body) {
    const userMessage = `Title: ${title}\nURL: ${url}\n\n${body}`;

    if (config.provider === "anthropic") {
      yield* anthropicStream(config, systemPrompt, userMessage, state);
    } else {
      yield* openaiStream(config, systemPrompt, userMessage, state);
    }
  };

  return { summarize, state };
}
