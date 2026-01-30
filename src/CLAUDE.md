# src/

Main source directory for the Bookor application.

## Entry Points

- `index.ts` - Bun server configuration and API routes
- `index.html` - HTML shell that imports frontend.tsx
- `frontend.tsx` - React root mounting, imports App.tsx and global CSS
- `App.tsx` - Main orchestrator managing views, modals, and app-level state

## App State (App.tsx)

App.tsx holds top-level state and passes callbacks to children:

- `view`: "list" | "editor" - current view mode
- `projects`: ProjectSummary[] - all saved projects
- `currentProject`: Project | null - actively edited project
- `showImportModal` / `showSettings`: boolean - modal visibility

## Data Flow

1. User actions trigger callbacks passed from App.tsx
2. State updates in App.tsx
3. Changes persist to localStorage via `lib/storage.ts`
4. UI re-renders with new state

## localStorage Keys

- `bookor_projects` - JSON array of all projects
- `bookor_current_project` - ID of last opened project
- `bookor_gemini_key` - User's Gemini API key

## Styling (index.css)

Uses CSS variables for theming:
- `--color-paper-*` - Background colors (warm paper tones)
- `--color-ink-*` - Text colors
- `--color-accent` - Terracotta (#C4593B)
- `--color-status-*` - Status badge colors (pending/translated/reviewed)

Typography:
- Display: Cormorant Garamond (serif)
- Body: Instrument Sans (sans-serif)
- Korean: Noto Serif KR
