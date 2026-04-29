# AI Email Writer (Groq, Frontend Only)

Generate professional emails from short prompts using Groq in a plain HTML/CSS/JS app that runs directly with Live Server.

## Features

- Prompt -> professional email subject + body
- Tone, length, email type, and audience controls
- Regenerate variations
- Copy subject/body buttons
- Local history (last 10 generations)
- Works without Node/Express backend

## Setup

1. Open the `14` folder in VS Code/Cursor.

2. Start a Live Server session on `index.html`.

3. In the app UI, paste your `Groq API key` in the API key field (`gsk_...`).

4. Generate emails.

## Notes

- The API key is stored in your browser localStorage for convenience.
- This is convenient for local usage but **not secure for public deployment**.
- Current model: `llama-3.3-70b-versatile`.
