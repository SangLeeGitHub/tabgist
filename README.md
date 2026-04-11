# TabGist

> Summarize any web page in one click — powered by LLM, streamed in a new tab.

[한국어](README.ko.md)

TabGist is a Chrome extension (Manifest V3) that extracts the current tab's content and generates a concise summary using an LLM of your choice. Click the toolbar icon, and a new tab opens with the summary streamed in real time.

## Features

- **One-click summarization** — Click the toolbar icon on any web page
- **Real-time streaming** — Summary appears token by token as the LLM generates it
- **Dual provider support**
  - **Anthropic** — Claude models via the Messages API
  - **OpenAI-compatible** — OpenAI, LM Studio, Ollama, llama.cpp, OpenRouter, Groq, vLLM, and any `/v1/chat/completions` endpoint
- **7 built-in presets** — One-click configuration for popular providers
- **8 output languages** — Auto (follows page language), Korean, English, Japanese, Chinese, Spanish, French, German
- **Dark mode** — Follows your system preference
- **Connection test** — Verify your API settings before use
- **Thinking timer** — Real-time elapsed timer shown while waiting for the first token
- **Stats display** — Thinking time, total time, and tokens/second shown after each summary
- **Truncation warning** — Alert when output is cut off due to max_tokens limit
- **Custom system prompt** — Override the default prompt to customize output format
- **`max_completion_tokens` option** — Support for models that require `max_completion_tokens` instead of `max_tokens`
- **Action buttons** — Regenerate, copy, open original, close

## Installation

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `TabGist` folder
5. Click the TabGist icon in the toolbar to get started

## Setup

1. Right-click the TabGist icon → **Options** (or go to `chrome://extensions` → TabGist → Details → Extension options)
2. Select a **Provider** (Anthropic or OpenAI-compatible)
3. Enter your **API Key** (leave empty for local servers like LM Studio / Ollama)
4. Adjust **Base URL**, **Model**, **Max Tokens**, and **System Prompt** as needed — or use the preset dropdown
5. (Optional) Enable **Use `max_completion_tokens`** for models that require it (e.g. o1, o3, gpt-5.4-nono)
6. Click **Test Connection** to verify
7. Click **Save**

## Usage

1. Navigate to any web page (article, blog, wiki, etc.)
2. Click the TabGist toolbar icon
3. A new tab opens showing:
   - **Analyzing page...** while content is extracted
   - **Generating summary...** while waiting for the first token
   - Streaming summary with a typing cursor
   - Real-time timer while waiting for the first token
   - Stats at the bottom when complete
   - Warning if output was truncated
4. Use the action buttons to regenerate, copy, open the original, or close

### Supported Presets

| Preset | Base URL | Default Model |
|--------|----------|---------------|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Z.AI | `https://api.z.ai/api/paas/v4` | `glm-5.1` |
| LM Studio | `http://localhost:1234/v1` | — |
| llama.cpp server | `http://localhost:8080/v1` | — |
| Ollama | `http://localhost:11434/v1` | — |
| OpenRouter | `https://openrouter.ai/api/v1` | — |

### Language Settings

| Setting | Behavior |
|---------|----------|
| Auto | Summarize in the same language as the source page |
| Specific language | Translate and summarize in the chosen language regardless of source |

## Project Structure

```
TabGist/
├── manifest.json           # Manifest V3 config
├── background.js           # Service worker (orchestration)
├── content.js              # Readability-based content extraction
├── providers/
│   ├── index.js            # Common interface + language-aware prompts
│   ├── anthropic.js        # Anthropic Messages API + SSE
│   └── openai.js           # OpenAI-compatible /chat/completions + SSE
├── lib/
│   └── Readability.js      # Mozilla Readability (vendored)
├── summary/
│   ├── summary.html        # Summary result page
│   ├── summary.js          # Streaming renderer + stats
│   └── summary.css         # Styles with dark mode
├── options/
│   ├── options.html        # Settings page
│   ├── options.js          # Settings logic + presets + test
│   └── options.css         # Settings styles
└── icons/                  # 16/48/128 PNG icons
```

## Tech Stack

- Vanilla JavaScript (no build step, no framework)
- Mozilla Readability.js for content extraction
- CSS with custom properties (dark mode via `prefers-color-scheme`)
- Chrome Extension Manifest V3

## Notes

- `chrome://`, `file://`, and other restricted pages cannot be summarized
- Pages with very little text content (< 50 characters) will show an error
- API keys are stored in `chrome.storage.local`; other settings in `chrome.storage.sync`
- Max Tokens default is 2048 — increase in settings if summaries are truncated
- A truncation warning will appear automatically when the output reaches the token limit

## License

MIT
