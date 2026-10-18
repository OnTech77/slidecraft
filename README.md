# Slidecraft

Turn Markdown into beautiful slide presentations, with AI enhancements.

Write or upload Markdown, watch your slides update in real time, pick a theme, let AI polish the content, and download a PDF.

## Features

- **Write or upload**: type in the editor or drop in a `.md` file (up to 10 MB)
- **Real-time preview**: slides re-render as you type, with thumbnails, keyboard navigation and speaker notes
- **Themes**: Default, Midnight, Corporate, Sunset and Editorial, previewed on your own slides
- **AI enhancements** (OpenAI): improve wording, make concise, add speaker notes, improve titles, expand an outline. You review a before/after comparison before anything changes, and can undo it.
- **Long content fits automatically**: documents without `---` are split into one slide per `#`/`##` section, and slides with too much content continue on extra "(continued)" slides, so text never runs off a slide
- **Export**: PDF (one 16:9 page per slide, rendered by headless Chrome using the same CSS as the preview), a standalone HTML page, Slidecraft Markdown or JSON

## Quick start

Requires **Node.js 20.19 or newer**.

```bash
# 1. Install dependencies for the root, server and client
npm run install:all

# 2. Configure the server (the OpenAI key is optional)
cp server/.env.example server/.env
#    then edit server/.env and set OPENAI_API_KEY to enable AI features

# 3. Start the server (port 3001) and client (port 5173) together
npm run dev
```

Open http://localhost:5173 and click **Load sample** to try it with [`sample.md`](sample.md).

Without an `OPENAI_API_KEY`, everything except the AI step works, and the AI step explains how to turn it on.

### Production

```bash
npm run build   # builds the React app into client/dist
npm start       # Express serves the API and the built app on http://localhost:3001
```

### Tests

```bash
npm test        # server unit and API tests (node:test), including a real PDF render
```

## Writing slides

```markdown
---
title: My Talk
theme: midnight
---

# My Talk
A short subtitle

---

## Agenda
- Why
- How
- What next

Note: Speaker notes go after a line starting with "Note:".
```

| Syntax | Meaning |
| --- | --- |
| `---` on its own line | Starts a new slide (ignored inside code blocks). A file with no `---` lines gets one slide per `#`/`##` heading instead |
| Front matter at the top | `title`, `author` and `theme` (`default`, `midnight`, `corporate`, `sunset`, `editorial`) |
| `Note:` line | Everything after it on that slide becomes speaker notes |
| `#` heading + short text | Becomes a centered title slide |
| A `>` quote | Becomes a quote slide |

Standard Markdown works too: lists, **bold**, *italic*, links, images, tables and code blocks.

If a slide has more content than fits, it is split automatically between list items, table rows (the header repeats), code lines or sentences, and the extra slides repeat the heading with "(continued)". A heading is never left alone at the bottom of a slide. The Markdown export saves the deck already split, exactly as you see it.

## Project structure

```
slidecraft/
├─ package.json              Root scripts (dev, build, start, test)
├─ sample.md                 Example deck
├─ server/                   Node.js + Express API
│  ├─ index.js               Entry point (port 3001)
│  ├─ app.js                 Express app: security middleware, routes, error handling
│  ├─ routes/                slides.js, themes.js, ai.js, export.js
│  ├─ services/
│  │  ├─ aiService.js        OpenAI integration and prompt rules
│  │  ├─ slideGenerator.js   Markdown → presentation (layouts, themes, export HTML)
│  │  ├─ exportService.js    PDF rendering with Puppeteer
│  │  └─ formatExports.js    HTML, Markdown and JSON exports
│  ├─ utils/
│  │  ├─ markdownParser.js   marked + DOMPurify, slides, front matter, notes
│  │  ├─ slideFitter.js      Splits long slides so content always fits
│  │  ├─ validation.js       Input checks and cleaning
│  │  └─ errors.js           AppError and the safe error handler
│  ├─ themes/                base.css + one CSS file per theme
│  └─ tests/
└─ client/                   React + Vite frontend
   └─ src/
      ├─ App.jsx             State and step-by-step flow
      ├─ services/api.js     API client with friendly errors
      ├─ hooks/useDebounce.js
      └─ components/         MarkdownEditor, FileUpload, SlidePreview, ScaledSlide,
                             ThemeSelector, AIEnhancePanel, ExportPanel, Stepper,
                             Alert, ErrorBoundary
```

## API

All endpoints are under `/api`. Errors always look like `{ "error": { "code": "...", "message": "..." } }`, and the message is safe to show to users.

| Method | Endpoint | Body | Returns |
| --- | --- | --- | --- |
| GET | `/health` | | `{ status }` |
| GET | `/themes` | | `{ themes, defaultTheme }` |
| GET | `/themes/styles.css` | | CSS for all themes |
| GET | `/slides/sample` | | `{ markdown }` |
| POST | `/slides/parse` | `{ markdown, theme? }` | Presentation (`title`, `theme`, `slides[]`) |
| POST | `/slides/upload` | multipart `file` (.md) | `{ filename, markdown, presentation }` |
| GET | `/ai/status` | | `{ configured, model, actions[] }` |
| POST | `/ai/enhance` | `{ markdown, action }` | `{ markdown, action, model }` |
| POST | `/export/:format` | `{ markdown, theme?, filename? }` | File download; `format` is `pdf`, `html`, `md` or `json` |

## Security

- **Uploads**: `.md`/`.markdown` only, one file, 10 MB maximum. Files are kept in memory and never written to disk, and they must be valid UTF-8 text.
- **Sanitization**: Markdown HTML is cleaned with DOMPurify, which removes scripts, event handlers, inline styles, iframes, forms and `javascript:` links. Control characters are stripped from input.
- **Errors**: clients only receive friendly messages. Stack traces and provider details are logged on the server only.
- **AI**: the OpenAI key stays on the server. AI requests are rate limited per IP, and content is limited to 30,000 characters.
- **PDF export**: JavaScript is disabled in the render, and only `data:` URLs and public `https://` resources can be loaded, so a deck can't make the server read local files or internal addresses. Exports have timeouts and a rate limit.
- **HTTP**: helmet security headers (including a Content Security Policy), a CORS allow-list and a 10 MB request body limit.

## Configuration (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin in development |
| `OPENAI_API_KEY` | (empty) | Enables AI features |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for enhancements |
