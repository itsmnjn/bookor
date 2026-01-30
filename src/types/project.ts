export type ParagraphStatus = "pending" | "translated" | "reviewed"

export interface Paragraph {
  id: string
  original: string
  translated: string
  status: ParagraphStatus
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
