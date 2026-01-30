# components/

React components for the Bookor UI. All components are functional and receive props/callbacks from parent.

## Component Hierarchy

```
App.tsx (orchestrator)
├── ProjectList.tsx       # List view - shows all projects
│   └── ProgressBar.tsx
│
├── Editor.tsx            # Editor view - translation workspace
│   ├── Sidebar           # Chapter navigator (inline)
│   ├── ParagraphPair     # Original + translation pair (inline)
│   └── ProgressBar.tsx
│
├── ImportModal.tsx       # Create/import project dialog
├── SettingsPanel.tsx     # API key + translation prompt config
└── Icons.tsx             # SVG icon components
```

## Components

### ProjectList
Displays saved projects as cards with progress bars. Handles project selection and "new project" action.

### Editor
Main translation workspace with:
- Header bar (title, overall progress, settings toggle)
- Sidebar (chapter list with status indicators)
- Content area (paragraph pairs with translate/review actions)

Manages chapter selection and paragraph translation state internally.

### ImportModal
Two-tab dialog for creating projects:
- **File tab**: Drag-drop or click to upload .txt files
- **URL tab**: Fetch from Project Gutenberg by URL

### SettingsPanel
Right-side overlay for:
- Gemini API key input with connection test
- Custom translation prompt editor

### ProgressBar
Reusable progress indicator showing translated/reviewed/total counts.

### Icons
SVG icon components: ChevronLeft, Plus, Upload, Settings, X, Link, Check, AlertCircle

## Patterns

- Props follow `{ data, onAction }` convention
- No prop drilling beyond one level - App.tsx manages shared state
- Inline sub-components (Sidebar, ParagraphPair) when only used in one place
- Status styling via `data-status` attributes for CSS targeting
