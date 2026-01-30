---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# Bookor

A book translation workspace for importing books and translating them paragraph-by-paragraph using Google Gemini.

## Project Structure

```
src/
├── index.ts          # Bun.serve() entry point
├── index.html        # HTML template
├── frontend.tsx      # React root
├── App.tsx           # Main app orchestrator
├── index.css         # Global styles + CSS variables
├── components/       # React components (see src/components/CLAUDE.md)
├── lib/              # Utilities (see src/lib/CLAUDE.md)
└── types/            # TypeScript types (see src/types/CLAUDE.md)
```

## Architecture

- **Backend**: Bun.serve() with route-based API (no Express)
- **Frontend**: React 19 with functional components and hooks
- **Storage**: Browser localStorage (no database)
- **Styling**: Plain CSS with CSS variables (no Tailwind)
- **AI**: Google Generative AI SDK (`@google/genai`)
- **EPUB Parsing**: JSZip for reading EPUB archives

## Import Formats

- **EPUB** (preferred): Extracts metadata from OPF, chapters from spine order
- **TXT**: Detects chapters via regex patterns, strips Gutenberg boilerplate

Smart paragraph grouping combines short consecutive paragraphs (dialogue) until reaching 250 char threshold.

## Views

The app has two main views managed by `App.tsx`:
- **ProjectList** (`view="list"`): Browse and select projects
- **Editor** (`view="editor"`): Translate paragraphs in selected project

## API Routes

| Route | Purpose |
|-------|---------|
| `/*` | Serves SPA (index.html) |
| `/api/fetch-gutenberg?url=` | Fetches book text from Project Gutenberg |

## Commands

- `bun --hot src/index.ts` - Dev server with HMR
- `bun run typecheck` - Type check
- `railway up` - Deploy to Railway

## Deployment

Hosted on Railway (auto-detects Bun via bun.lock):
- **URL**: https://bookor-production.up.railway.app

---

# Bun Guidelines

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

## Type Checking

Always run `bun run typecheck` after making changes to verify there are no TypeScript errors.
