import type { Chapter, Paragraph, Project } from "../types/project"
import { parseEpubFile } from "./epubParser"
import { getDefaultPreset } from "./presets"

const MIN_GROUP_LENGTH = 250 // Minimum characters before flushing a paragraph group

/**
 * Strip Project Gutenberg boilerplate (license text before/after content).
 */
function stripGutenbergBoilerplate(text: string): string {
  const startPattern = /\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i
  const endPattern = /\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i

  let content = text

  const startMatch = content.match(startPattern)
  if (startMatch?.index !== undefined) {
    content = content.slice(startMatch.index + startMatch[0].length)
  }

  const endMatch = content.match(endPattern)
  if (endMatch?.index !== undefined) {
    content = content.slice(0, endMatch.index)
  }

  return content.trim()
}

/**
 * Check if a line is a chapter heading using comprehensive patterns.
 */
function isChapterHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 80) return false

  // Section word + number: "Chapter 1", "Letter IV", "Book Three", etc.
  const sectionPattern = /^(chapter|part|book|volume|letter|act|scene|section|canto)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)/i
  if (sectionPattern.test(trimmed)) return true

  // Standalone sections: "Preface", "Prologue", "Epilogue", etc.
  const standalones = ['preface', 'prologue', 'epilogue', 'introduction', 'conclusion', 'foreword', 'afterword', 'dedication']
  if (standalones.includes(trimmed.toLowerCase())) return true

  // Bare numbers: "1.", "I.", "XII."
  if (/^(\d+|[IVXLCDM]+)\.\s*$/.test(trimmed) && trimmed.length < 20) return true

  return false
}

/**
 * Check if an ALL CAPS line should be treated as a chapter heading.
 * More restrictive to avoid false positives.
 */
function isAllCapsChapterHeading(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed !== trimmed.toUpperCase() || !/[A-Z]/.test(trimmed)) return false
  if (trimmed.length < 3 || trimmed.length > 60) return false

  // Exclude common false positives
  const excluded = ['THE END', 'FIN', 'FINIS', 'PROJECT GUTENBERG', 'COPYRIGHT', 'CONTENTS', 'TABLE OF CONTENTS']
  if (excluded.some(e => trimmed.includes(e))) return false

  // Single-word: only accept known section words
  const words = trimmed.split(/\s+/)
  if (words.length === 1) {
    const allowed = ['PREFACE', 'PROLOGUE', 'EPILOGUE', 'INTRODUCTION', 'CONCLUSION', 'FOREWORD', 'AFTERWORD', 'DEDICATION']
    return allowed.includes(trimmed)
  }

  // Multi-word: reject if ends with ! or ? (likely dialogue/exclamation)
  if (/[!?]$/.test(trimmed)) return false

  return true
}

/**
 * Parse a plain text file into a Project structure.
 * Detects chapters via patterns (Chapter X, Letter IV, Book One, etc.)
 * and strips Gutenberg boilerplate.
 */
export function parseTextFile(
  text: string,
  title: string,
  author: string,
  translationPrompt?: string,
): Project {
  // Strip Gutenberg boilerplate first
  const strippedText = stripGutenbergBoilerplate(text)

  const lines = strippedText.split(/\r?\n/)
  const chapters: Chapter[] = []

  let currentChapter: Chapter | null = null
  let currentParagraph = ""
  let chapterNumber = 0
  let paragraphId = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    // Check for chapter heading using improved detection
    if (isChapterHeading(trimmed) || isAllCapsChapterHeading(trimmed)) {
      // Save current paragraph if exists
      if (currentParagraph.trim() && currentChapter) {
        currentChapter.paragraphs.push(createParagraph(paragraphId++, currentParagraph.trim()))
        currentParagraph = ""
      }

      // Start new chapter
      chapterNumber++
      currentChapter = {
        id: `ch-${chapterNumber}`,
        title: trimmed,
        number: chapterNumber,
        paragraphs: [],
      }
      chapters.push(currentChapter)
      continue
    }

    // If no chapter yet, create a default one
    if (!currentChapter) {
      chapterNumber++
      currentChapter = {
        id: `ch-${chapterNumber}`,
        title: "Beginning",
        number: chapterNumber,
        paragraphs: [],
      }
      chapters.push(currentChapter)
    }

    // Empty line = end of paragraph
    if (trimmed === "") {
      if (currentParagraph.trim()) {
        currentChapter.paragraphs.push(createParagraph(paragraphId++, currentParagraph.trim()))
        currentParagraph = ""
      }
    } else {
      // Continue building paragraph
      currentParagraph += (currentParagraph ? " " : "") + trimmed
    }
  }

  // Don't forget the last paragraph
  if (currentParagraph.trim() && currentChapter) {
    currentChapter.paragraphs.push(createParagraph(paragraphId++, currentParagraph.trim()))
  }

  // Filter out empty chapters
  const nonEmptyChapters = chapters.filter(ch => ch.paragraphs.length > 0)

  return {
    id: `proj-${Date.now()}`,
    title,
    author,
    chapters: nonEmptyChapters,
    translationPrompt: translationPrompt ?? getDefaultPreset().prompt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function createParagraph(id: number, text: string): Paragraph {
  return {
    id: `p-${id}`,
    original: text,
    translated: "",
    status: "pending",
    excluded: false,
  }
}

/**
 * Unified entry point for parsing book files.
 * Detects format by extension and applies paragraph grouping.
 */
export async function parseBookFile(
  file: File,
  title: string,
  author: string,
  translationPrompt?: string,
): Promise<Project> {
  const ext = file.name.toLowerCase().split(".").pop()

  let project: Project
  if (ext === "epub") {
    project = await parseEpubFile(file, title, author, translationPrompt)
  } else {
    const text = await file.text()
    project = parseTextFile(text, title, author, translationPrompt)
  }

  // Apply paragraph grouping to combine short paragraphs
  return applyParagraphGrouping(project, MIN_GROUP_LENGTH)
}

/**
 * Apply paragraph grouping to all chapters in a project.
 * Groups consecutive short paragraphs until reaching minimum length.
 */
function applyParagraphGrouping(project: Project, minLength: number): Project {
  const groupedChapters = project.chapters.map((chapter) => ({
    ...chapter,
    paragraphs: groupParagraphs(chapter.paragraphs, minLength),
  }))

  return {
    ...project,
    chapters: groupedChapters,
  }
}

/**
 * Group consecutive paragraphs until reaching minimum character threshold.
 * Short dialogue lines and fragments are combined into larger units.
 */
function groupParagraphs(paragraphs: Paragraph[], minLength: number): Paragraph[] {
  const grouped: Paragraph[] = []
  let buffer: string[] = []
  let bufferedLength = 0
  let id = 0

  for (const p of paragraphs) {
    buffer.push(p.original)
    bufferedLength += p.original.length

    if (bufferedLength >= minLength) {
      grouped.push(createParagraph(id++, buffer.join("\n\n")))
      buffer = []
      bufferedLength = 0
    }
  }

  // Emit remaining content
  if (buffer.length > 0) {
    grouped.push(createParagraph(id++, buffer.join("\n\n")))
  }

  return grouped
}
