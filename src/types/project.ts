export type ParagraphStatus = "pending" | "translated" | "reviewed"

export type KoreanEndingStyle = "formal" | "informal" | "plain"
export type AutoTranslateStatus = "idle" | "running" | "paused" | "completed"

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

export interface ParagraphLocator {
  chapterId: string
  paragraphId: string
}

export interface AutoTranslateFailure {
  locator: ParagraphLocator
  error: string
}

export interface AutoTranslateState {
  status: AutoTranslateStatus
  queue: ParagraphLocator[]
  currentIndex: number
  completedCount: number
  failed: AutoTranslateFailure[]
  startedAt?: number
  updatedAt: number
  completedAt?: number
}

export interface Project {
  id: string
  title: string
  author: string
  chapters: Chapter[]
  translationPrompt: string
  importBatchSize: number
  koreanEndingStyle?: KoreanEndingStyle  // For Korean → Korean translations
  autoTranslate: AutoTranslateState
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
