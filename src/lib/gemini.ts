import { GoogleGenAI } from "@google/genai"
import type { Paragraph, ParagraphLocator, Project } from "../types/project"
import {
  buildTranslationContext,
  findParagraphByLocator,
  isParagraphEligibleForAutoTranslate,
  type TranslationContext,
} from "./autoTranslate"

const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash"

let client: GoogleGenAI | null = null

export interface TranslateParagraphOptions {
  signal?: AbortSignal
  context?: TranslationContext | null
}

export interface AutoTranslateRunnerState {
  status: "running" | "completed" | "aborted"
  currentIndex: number
  total: number
  currentLocator: ParagraphLocator | null
}

export interface RunProjectAutoTranslateOptions {
  project: Project
  queue: ParagraphLocator[]
  prompt: string
  startIndex?: number
  signal?: AbortSignal
  onItemStart?: (locator: ParagraphLocator, index: number, total: number) => void
  onItemSuccess?: (locator: ParagraphLocator, translation: string, index: number, total: number) => void
  onItemFailure?: (locator: ParagraphLocator, error: Error, index: number, total: number) => void
  onStateChange?: (state: AutoTranslateRunnerState) => void
}

export function initGemini(apiKey: string): void {
  client = new GoogleGenAI({ apiKey })
}

export async function validateAndInitGemini(apiKey: string): Promise<void> {
  const candidate = new GoogleGenAI({ apiKey })

  const result = await candidate.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: "Reply with exactly OK.",
  })

  if (!result.text?.trim()) {
    throw new Error("Gemini returned an empty response.")
  }

  client = candidate
}

export function isGeminiInitialized(): boolean {
  return client !== null
}

export async function translateParagraph(
  paragraph: Paragraph,
  prompt: string,
  options: TranslateParagraphOptions = {},
): Promise<string> {
  if (!client) {
    throw new Error("Gemini not initialized. Please set your API key.")
  }

  const fullPrompt = buildGeminiTranslationPrompt(prompt, paragraph.original, options.context)

  const result = await client.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: fullPrompt,
    config: {
      abortSignal: options.signal,
      temperature: 0.3, // Lower temperature for more consistent translations
      maxOutputTokens: 8192,
    },
  })

  // Log response details for debugging
  console.log("Gemini response:", {
    text: result.text?.slice(0, 100) + "...",
    finishReason: result.candidates?.[0]?.finishReason,
    safetyRatings: result.candidates?.[0]?.safetyRatings,
  })

  if (result.candidates?.[0]?.finishReason && result.candidates[0].finishReason !== "STOP") {
    console.warn("Translation may be incomplete. Finish reason:", result.candidates[0].finishReason)
  }

  return result.text || ""
}

export function buildGeminiTranslationPrompt(
  prompt: string,
  targetText: string,
  context?: TranslationContext | null,
): string {
  if (!context || (context.before.length === 0 && context.after.length === 0)) {
    return `${prompt}\n\nText to translate:\n${targetText}`
  }

  return `Translation instructions for TARGET PASSAGE:
${prompt}

When the translation instructions refer to "the following text", "the text", or similar wording, interpret that as TARGET PASSAGE only.
Use the surrounding context only to resolve pronouns, speaker identity, tone, references, and continuity.
Translate only the TARGET PASSAGE. Do not translate or include any context passages in your answer.

${formatContextSection("Context before", context.before)}

TARGET PASSAGE:
${targetText}

${formatContextSection("Context after", context.after)}`
}

function formatContextSection(label: string, passages: string[]): string {
  if (passages.length === 0) return `${label}:\nNone`

  return `${label}:\n${passages.map((passage, index) => `[${index + 1}] ${passage}`).join("\n\n")}`
}

export async function translateBatch(
  paragraphs: Paragraph[],
  prompt: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]!
    try {
      const translation = await translateParagraph(para, prompt)
      results.set(para.id, translation)
    } catch (error) {
      console.error(`Failed to translate paragraph ${para.id}:`, error)
      results.set(para.id, "") // Empty string indicates failure
    }

    onProgress?.(i + 1, paragraphs.length)

    // Small delay to avoid rate limiting
    if (i < paragraphs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

export async function runProjectAutoTranslate({
  project,
  queue,
  prompt,
  startIndex = 0,
  signal,
  onItemStart,
  onItemSuccess,
  onItemFailure,
  onStateChange,
}: RunProjectAutoTranslateOptions): Promise<AutoTranslateRunnerState> {
  const total = queue.length
  const initialIndex = Math.max(0, Math.min(startIndex, total))

  onStateChange?.({
    status: "running",
    currentIndex: initialIndex,
    total,
    currentLocator: queue[initialIndex] ?? null,
  })

  for (let index = initialIndex; index < total; index++) {
    const locator = queue[index]!

    if (signal?.aborted) {
      return {
        status: "aborted",
        currentIndex: index,
        total,
        currentLocator: locator,
      }
    }

    const match = findParagraphByLocator(project, locator)
    if (!match || !isParagraphEligibleForAutoTranslate(match.paragraph)) {
      onStateChange?.({
        status: "running",
        currentIndex: index + 1,
        total,
        currentLocator: queue[index + 1] ?? null,
      })
      continue
    }

    onItemStart?.(locator, index, total)

    try {
      const translation = await translateParagraph(match.paragraph, prompt, {
        signal,
        context: buildTranslationContext(project, locator),
      })

      if (signal?.aborted) {
        return {
          status: "aborted",
          currentIndex: index,
          total,
          currentLocator: locator,
        }
      }

      onItemSuccess?.(locator, translation, index, total)
      onStateChange?.({
        status: "running",
        currentIndex: index + 1,
        total,
        currentLocator: queue[index + 1] ?? null,
      })
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return {
          status: "aborted",
          currentIndex: index,
          total,
          currentLocator: locator,
        }
      }

      onItemFailure?.(locator, toError(error), index, total)
      onStateChange?.({
        status: "running",
        currentIndex: index + 1,
        total,
        currentLocator: queue[index + 1] ?? null,
      })
    }

    if (index < total - 1) {
      try {
        await waitWithAbort(100, signal)
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          return {
            status: "aborted",
            currentIndex: index + 1,
            total,
            currentLocator: queue[index + 1] ?? null,
          }
        }

        throw error
      }
    }
  }

  const completedState: AutoTranslateRunnerState = {
    status: "completed",
    currentIndex: total,
    total,
    currentLocator: null,
  }

  onStateChange?.(completedState)
  return completedState
}

export interface BookMetadata {
  title: string
  author: string
}

export async function detectBookMetadata(textSample: string): Promise<BookMetadata> {
  if (!client) {
    throw new Error("Gemini not initialized. Please set your API key.")
  }

  const prompt = `Analyze the following text from the beginning of a book and extract the title and author.
Return ONLY a JSON object in this exact format, with no additional text or markdown:
{"title": "Book Title", "author": "Author Name"}

If you cannot determine the title or author, use "Unknown" for that field.

Text:
${textSample}`

  const result = await client.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  })

  const responseText = result.text || ""

  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title || "Unknown",
        author: parsed.author || "Unknown",
      }
    }
  } catch (e) {
    console.error("Failed to parse metadata response:", responseText)
  }

  return { title: "Unknown", author: "Unknown" }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybeError = error as { name?: string }
  return maybeError.name === "AbortError"
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(typeof error === "string" ? error : "Translation failed")
}

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, ms)

    const handleAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener("abort", handleAbort)
      reject(new DOMException("Aborted", "AbortError"))
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })
}
