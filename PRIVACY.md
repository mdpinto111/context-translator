# Privacy Policy — Context Translator

_Last updated: November 16, 2026_

Context Translator is a browser extension that translates text you select on a web page. This policy explains what data the extension handles.

## No servers of our own
The extension has **no backend**. The developer does not operate any server and **does not collect, store, sell or share any data**. There is no analytics, tracking or telemetry.

## What is sent, and where
Only when **you** trigger a translation (by clicking the 文 icon or using the right-click menu), the extension sends the following directly from your browser to the **AI provider you selected** in the options:

- the selected text;
- a short excerpt of surrounding text (a few sentences, at most ~2,000 characters);
- the page title, the nearest section heading and the page's declared language;
- your target language.

The request goes to one of: Anthropic (Claude), OpenAI, Google (Gemini), a local Ollama server on your computer, or a custom OpenAI-compatible endpoint that you configure. That provider processes the request under its own privacy policy and terms. With **Ollama or another local server, no data leaves your computer**.

Nothing is sent while you browse, and nothing is sent when you merely select text without requesting a translation.

## What is stored locally
Your settings (provider, model, API key, languages, preferences) are stored in your browser's extension storage (`chrome.storage.local`) on your device only. API keys are not encrypted at rest and are sent only to the provider they belong to. Recent translations are cached in memory and discarded when the browser stops the extension's background process.

## Permissions
- **Access to all sites (content script)**: needed to read the text you select on any page and show the translation popup next to it. Page content is not read or transmitted until you request a translation.
- **Storage**: to save your settings.
- **Context menus**: to add the "Translate with context" right-click entry.
- **Host permissions for AI provider domains / localhost**: to send translation requests to the provider you chose. Access to a custom endpoint is requested only when you configure one.

## Children
The extension is not directed at children and collects no personal information.

## Changes
Changes to this policy will be published in this file in the project repository.

## Contact
Open an issue at https://github.com/mdpinto111/context-translator/issues
