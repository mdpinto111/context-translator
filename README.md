# Context Translator

A browser extension (Chrome, Edge, Brave, Opera, Firefox ≥ 121) that translates the selected text **using the surrounding context**: the paragraph, the preceding and following sentences, the page title and the section heading. This lets the model pick the right meaning of a word ("bank" = *river bank* or *financial bank*), resolve pronouns, and keep domain terminology consistent — unlike the classic "Translate selection" feature, which translates text in isolation.

## Supported providers
| Provider | API key | Notes |
|---|---|---|
| Claude (Anthropic) | required | default, `claude-haiku-5-5` |
| ChatGPT (OpenAI) | required | `gpt-4o-mini` by default |
| Gemini (Google) | required | free key at aistudio.google.com |
| Ollama (local) | none | `http://localhost:11434`, no data leaves your machine |
| OpenAI-compatible | optional | LM Studio, OpenRouter, Mistral, Groq, vLLM… (base URL ending in `/v1`) |

**Free option — Gemini:**
1. Create a free API key (no credit card) at https://aistudio.google.com/app/apikey.
2. In the extension options, choose *Gemini (Google)* and paste the key: the list of models available to your key loads automatically (a "flash" model is fast and included in the free tier).
3. Click *Test connection*, then *Save*.

Note: on Google's free tier, requests may be used to improve Google's models.

**Ollama:** if the connection test returns a 403 error, restart Ollama with
`OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"`.

## Installation
**Chrome / Edge / Brave:** open `chrome://extensions` → enable *Developer mode* → *Load unpacked* → select this folder.

**Firefox:** open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → select `manifest.json`.

The options page opens on install (or click the extension icon). Pick a provider, enter your key, click *Test connection*, then *Save*.

## Usage
Select a word or sentence, then click the 文 icon that appears, or right-click → *Translate "…" with context*. The popup shows the translation, a short note explaining how the context influenced it, and a few alternatives. Press `Esc` to close it.

## Project structure
- `src/context.js` — context extraction (sentence splitting with `Intl.Segmenter`, ~2,000 characters max)
- `src/prompt.js` — prompt building and JSON response parsing
- `src/providers.js` — adapters for Anthropic / OpenAI / Gemini / Ollama / OpenAI-compatible
- `src/background.js` — context menu, model calls, cache
- `src/content.js` — floating icon and popup (Shadow DOM)
- `options/` — settings page

## Tests
```
node --test test/
```

## Limitations
Does not work in the built-in PDF viewer or on internal pages (`chrome://`, `about:`). API keys are stored unencrypted in the extension's local storage.
