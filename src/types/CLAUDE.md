# types/

TypeScript type definitions for the Bookor data model.

## Core Types (project.ts)

### Project
Full project with all content. Used when editing.

```typescript
Project {
  id: string
  title: string
  author: string
  chapters: Chapter[]
  translationPrompt: string    // Custom Gemini prompt
  createdAt: number
  updatedAt: number
}
```

### ProjectSummary
Lightweight version for list view. Avoids loading full chapter content.

```typescript
ProjectSummary {
  id: string
  title: string
  author: string
  progress: { translated: number, reviewed: number, total: number }
  updatedAt: number
}
```

### Chapter

```typescript
Chapter {
  id: string
  title: string
  number: number
  paragraphs: Paragraph[]
}
```

### Paragraph

```typescript
Paragraph {
  id: string
  original: string              // Source text (English)
  translated: string            // Target text (Korean)
  status: "pending" | "translated" | "reviewed"
}
```

## Translation Workflow States

1. **pending** - Not yet translated (gray)
2. **translated** - AI translation complete, awaiting review (blue)
3. **reviewed** - Human-verified translation (green)
