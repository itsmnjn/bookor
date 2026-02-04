export type ParagraphStatus = "pending" | "translated" | "reviewed"

export type KoreanEndingStyle = "formal" | "informal" | "plain"

export interface TranslationPreset {
  id: string
  name: string
  prompt: string
  isBuiltIn: boolean  // true for defaults, false for user-created
}

export interface Paragraph {
  id: string
  original: string
  translated: string
  status: ParagraphStatus
  excluded?: boolean  // Exclude from final output and progress calculations
}

export interface Chapter {
  id: string
  title: string
  number: number
  paragraphs: Paragraph[]
}

export interface Project {
  id: string
  title: string
  author: string
  chapters: Chapter[]
  translationPrompt: string
  koreanEndingStyle?: KoreanEndingStyle  // For Korean → Korean translations
  createdAt: number
  updatedAt: number
}

export interface ProjectSummary {
  id: string
  title: string
  author: string
  progress: {
    translated: number
    reviewed: number
    total: number
  }
  updatedAt: number
}
