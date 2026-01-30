import { GoogleGenAI } from "@google/genai"
import type { Paragraph } from "../types/project"

let client: GoogleGenAI | null = null

export function initGemini(apiKey: string): void {
  client = new GoogleGenAI({ apiKey })
}

export function isGeminiInitialized(): boolean {
  return client !== null
}

export async function translateParagraph(
  paragraph: Paragraph,
  prompt: string,
): Promise<string> {
  if (!client) {
    throw new Error("Gemini not initialized. Please set your API key.")
  }

  const fullPrompt = `${prompt}\n\nText to translate:\n${paragraph.original}`

  const result = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: fullPrompt,
    config: {
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
    model: "gemini-2.5-flash",
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
