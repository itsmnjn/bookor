import { describe, expect, test } from "bun:test"
import { buildGeminiTranslationPrompt } from "./gemini"

describe("Gemini prompt builder", () => {
  test("scopes custom following-text prompts to the target passage when context is present", () => {
    const prompt = buildGeminiTranslationPrompt(
      "Translate the following text to Korean in a dry noir style.",
      "He put the glass down.",
      {
        before: ["Mara walked into the room."],
        after: ["She did not look back."],
      },
    )

    expect(prompt).toContain("Translation instructions for TARGET PASSAGE:")
    expect(prompt).toContain("Translate the following text to Korean in a dry noir style.")
    expect(prompt).toContain(
      'When the translation instructions refer to "the following text", "the text", or similar wording, interpret that as TARGET PASSAGE only.',
    )
    expect(prompt).toContain("Context before:\n[1] Mara walked into the room.")
    expect(prompt).toContain("TARGET PASSAGE:\nHe put the glass down.")
    expect(prompt).toContain("Context after:\n[1] She did not look back.")
  })

  test("preserves the legacy prompt shape when no context is available", () => {
    const prompt = buildGeminiTranslationPrompt(
      "Translate the following text to Korean.",
      "Hello there.",
      null,
    )

    expect(prompt).toBe("Translate the following text to Korean.\n\nText to translate:\nHello there.")
  })
})
