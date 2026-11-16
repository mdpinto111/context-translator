# Store listing — Context Translator

Copy-paste material for the Chrome Web Store, Firefox Add-ons (AMO) and Microsoft Edge Add-ons.

## Name
Context Translator — AI translation that understands the page

## Short description (≤ 132 characters, Chrome "summary")
Translate selected text using the surrounding context. Free with Gemini, private with Ollama. Works with Claude and ChatGPT too.

## Category
Chrome: **Productivity** (alternative: Education) · Firefox: **Language Support** · Edge: **Productivity**

## Detailed description
Classic "Translate selection" tools translate words in isolation, so they get things wrong: "bank" becomes "banque" even when you're reading about a river, pronouns lose their meaning, and jargon gets translated literally.

Context Translator sends your selection **together with its context** — the surrounding sentences, the paragraph, the page title and the section heading — to an AI model, so the translation fits what you're actually reading.

HOW IT WORKS
• Select a word or a sentence on any page
• Click the 文 icon that appears (or right-click → "Translate with context")
• Get the translation in a small popup, with:
  – a short note explaining how the context changed the meaning
  – alternative translations
  – a one-click Copy button
  – a language picker to switch target language instantly

EXAMPLE
"We sat on the bank and watched the boats" → berge (river bank)
"The bank was closed on Sunday" → banque (financial bank)
Same word, correct meaning every time.

CHOOSE YOUR AI
• Google Gemini — free API key, no credit card
• Ollama — 100% local, nothing leaves your computer
• Anthropic Claude, OpenAI ChatGPT
• Any OpenAI-compatible server: LM Studio, OpenRouter, Mistral, Groq…

PRIVACY FIRST
• No account, no tracking, no analytics, no servers of ours
• Text is sent only when you ask for a translation, and only to the provider you picked
• Your API key stays in your browser

SMART DETAILS
• Automatic fallback: if a model is overloaded, another one is used
• If the text is already in your language, it's translated into your secondary language
• Works in text fields, dark mode supported
• Open source (MIT): https://github.com/mdpinto111/context-translator

## Single purpose (Chrome)
Translate text the user selects on a web page, using the surrounding page context to produce a more accurate translation.

## Permission justifications (Chrome)
- **Host permission `<all_urls>` (content script)**: The extension must detect the text the user selects on any website and display the translation popup next to it. Page content is only read around the selection, and only sent when the user explicitly requests a translation.
- **storage**: Saves the user's settings (AI provider, model, API key, languages).
- **contextMenus**: Adds the "Translate with context" item to the right-click menu.
- **activeTab**: Lets the right-click action reach the current tab.
- **Host permissions for api.anthropic.com, api.openai.com, generativelanguage.googleapis.com, localhost / 127.0.0.1**: Send translation requests to the AI provider chosen by the user (localhost for Ollama / LM Studio).
- **Optional host permissions `https://*/*`, `http://*/*`**: Requested at runtime only if the user configures a custom OpenAI-compatible endpoint, limited to that endpoint's origin.
- **Remote code**: No. All code is bundled in the package.

## Data usage disclosure (Chrome privacy tab)
- Collected: **Website content** (the selected text and surrounding excerpt), sent to the user-selected AI provider only to perform the translation the user requested.
- Not sold to third parties; not used for unrelated purposes; not used for creditworthiness.
- Privacy policy URL: https://github.com/mdpinto111/context-translator/blob/main/PRIVACY.md

## Firefox notes for reviewers
No build step: the submitted ZIP contains the source as-is (plain JavaScript, no minification, no dependencies). Background scripts: `src/prompt.js`, `src/providers.js`, `src/background.js`.

## Assets
- Icon 128×128: `icons/128.png`
- Screenshots 1280×800: `store/screenshot-*.png`
- Small promo tile 440×280: `store/promo-440x280.png`
