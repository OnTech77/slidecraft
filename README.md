# Slidecraft

Turn Markdown into beautiful slide presentations, with AI enhancements.

> Status: **Phase 1** — Markdown → slides with a live preview, fully client-side.

## Architecture

Slidecraft works like a compiler:

```
Markdown ──parser──▶ Deck (slide model) ──layout──▶ Deck + layouts ──renderer──▶ HTML / PDF / PPTX
                              ▲
                              └── AI plugins propose validated patches to the Deck
```

The **slide model** (`@slidecraft/schema`) is the contract every other part reads or writes.

### Repository layout

```
apps/
  web/          React editor + live preview
packages/
  schema/       Slide model types + Zod validators   (depends on nothing)
  parser/       Markdown → Deck                       (pure)
  layout/       Rule-based layout selection           (pure)
  renderer/     Deck → React components               (runs in browser and, later, Puppeteer)
  themes/       Built-in themes as design tokens
docs/adr/       Architecture Decision Records
```

Dependencies only point downward: `apps → renderer/layout/themes → parser → schema`.

### Roadmap

1. **Phase 1** — schema, parser, layout, renderer, themes, web editor *(current)*
2. **Phase 2** — Node API, workers, PDF export (Puppeteer), deck storage
3. **Phase 3** — AI gateway (provider abstraction, fallback, caching) + first plugins
4. **Phase 4** — PPTX export, template management, plugin SDK
5. **Phase 5** — real-time collaboration, split services where load justifies it

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # start the editor at http://localhost:5173
npm test           # run unit tests
npm run typecheck  # type-check the whole monorepo
```

## Writing slides

```markdown
---
title: My Talk
theme: midnight
---

# My Talk
A subtitle line

---

## Agenda
- Why
- How
- What next

Note: Speaker notes go after a line starting with "Note:"
```

Slides are separated by `---` on its own line. Front matter at the top sets deck options.
