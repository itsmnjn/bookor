# lib/

Utility modules for data handling and external integrations.

## Modules

### storage.ts
LocalStorage wrapper for project persistence.

Functions:
- `getProjects()` - Returns all ProjectSummary items
- `getProject(id)` - Loads full Project by ID
- `saveProject(project)` - Saves/updates a Project
- `deleteProject(id)` - Removes a Project
- `getCurrentProjectId()` / `setCurrentProjectId(id)` - Track last opened project

### parser.ts
Plain text book parser that extracts structure from .txt files.

`parseTextFile(text, title, author)` returns a Project with:
- Chapters detected via regex (Chapter X, Part X, roman numerals, ALL-CAPS lines)
- Paragraphs split by empty lines
- Default translation prompt included

Fallback: Creates single "Beginning" chapter if no chapter markers found.

### gemini.ts
Google Generative AI integration for translation.

`translateParagraph(apiKey, prompt, text)`:
- Uses `gemini-2.5-flash` model
- Combines custom prompt with paragraph text
- Returns translated string

API key is user-provided and stored in localStorage (not .env).
