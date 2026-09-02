# lib/

Utility modules for data handling and external integrations.

## Modules

### storage.ts
IndexedDB-backed project persistence with synchronous in-memory reads after startup.

Functions:
- `getProjects()` - Returns all ProjectSummary items
- `getProject(id)` - Loads full Project by ID
- `saveProject(project)` - Saves/updates a Project
- `deleteProject(id)` - Removes a Project
- `getCurrentProjectId()` / `setCurrentProjectId(id)` - Track last opened project

### database.ts
Shared IndexedDB request/transaction helpers for projects and custom presets.

### parser.ts
Unified book parser with smart paragraph grouping.

Entry point: `parseBookFile(file, title, author, prompt)` - auto-detects format by extension.

- `parseTextFile()` - TXT parser with chapter detection (Chapter X, Part X, roman numerals, ALL-CAPS)
- `groupParagraphs()` - Combines short paragraphs until reaching 250 char threshold
- Strips Gutenberg boilerplate automatically

### epubParser.ts
EPUB parser using JSZip + DOMParser.

- `parseEpubFile(file, title, author, prompt)` - Full EPUB parsing
- `extractEpubMetadata(file)` - Quick metadata extraction (no API key needed)

EPUB structure: container.xml → content.opf → spine order → XHTML chapters

### presets.ts
Translation preset definitions.

- `initializePresets()` - Loads and migrates custom presets into IndexedDB
- `getAllPresets()` - Returns built-in translation presets
- `getDefaultPreset()` - Returns the default preset

Presets define translation style prompts (e.g., formal, casual, literary).

### gemini.ts
Google Generative AI integration for translation and metadata detection.

- `initGemini(apiKey)` - Initialize the Gemini client
- `validateAndInitGemini(apiKey)` - Test an API key with a minimal Gemini request, then initialize the client
- `isGeminiInitialized()` - Check if API key is configured
- `translateParagraph(paragraph, prompt)` - Translate text using gemini-3.8-flash
- `detectBookMetadata(sample)` - AI-powered title/author detection for TXT files

API key is user-provided and stored in localStorage (not .env).
