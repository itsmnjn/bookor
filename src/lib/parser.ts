import type { Chapter, Paragraph, Project } from "../types/project"

/**
 * Parse a plain text file into a Project structure.
 * Assumes chapters are marked by lines starting with "Chapter" or roman numerals,
 * or by significant whitespace gaps.
 */
export function parseTextFile(
  text: string,
  title: string,
  author: string,
): Project {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []

  let currentChapter: Chapter | null = null
  let currentParagraph = ""
  let chapterNumber = 0
  let paragraphId = 0

  const chapterPattern = /^(chapter\s+\d+|chapter\s+[ivxlcdm]+|part\s+\d+|part\s+[ivxlcdm]+|\d+\.|[ivxlcdm]+\.)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    // Check for chapter heading
    if (
      chapterPattern.test(trimmed)
      || (trimmed.length > 0 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))
    ) {
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
    translationPrompt: getDefaultPrompt(),
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
  }
}

function getDefaultPrompt(): string {
  return `Translate the following English text to Korean.
Use natural, conversational Korean suitable for reading aloud.
Avoid overly formal or literary vocabulary.
Keep the translation faithful to the original meaning while making it accessible to Korean learners.
Do not add any explanations or notes - just provide the translation.`
}
