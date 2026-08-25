import type { KoreanEndingStyle, TranslationPreset } from "../types/project"
import { CUSTOM_PRESETS_STORE, deleteRecord, getAllRecords, putRecords } from "./database"

const CUSTOM_PRESETS_STORAGE = "bookor_custom_presets"

let customPresets: TranslationPreset[] = []
let initializationPromise: Promise<void> | null = null

export function initializePresets(): Promise<void> {
  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    const indexedPresets = await getAllRecords<TranslationPreset>(CUSTOM_PRESETS_STORE)
    const presetsById = new Map(indexedPresets.map((preset) => [preset.id, preset]))
    const legacyData = localStorage.getItem(CUSTOM_PRESETS_STORAGE)

    if (legacyData) {
      const legacyPresets = parseStoredPresets(legacyData)
      const presetsToMigrate: TranslationPreset[] = []

      for (const legacyPreset of legacyPresets) {
        if (presetsById.has(legacyPreset.id)) continue
        presetsById.set(legacyPreset.id, legacyPreset)
        presetsToMigrate.push(legacyPreset)
      }

      await putRecords(CUSTOM_PRESETS_STORE, presetsToMigrate)
      localStorage.removeItem(CUSTOM_PRESETS_STORAGE)
    }

    customPresets = [...presetsById.values()]
  })()

  return initializationPromise
}

// Korean sentence ending styles
export const KOREAN_ENDING_STYLES: { value: KoreanEndingStyle; label: string; example: string; description: string }[] =
  [
    {
      value: "formal",
      label: "합쇼체 (-습니다/-ㅂ니다)",
      example: "갑니다, 먹습니다",
      description: "Most formal, polite style",
    },
    {
      value: "informal",
      label: "해요체 (-요)",
      example: "가요, 먹어요",
      description: "Informal polite, conversational",
    },
    { value: "plain", label: "해라체 (-다)", example: "간다, 먹는다", description: "Written/narrative style" },
  ]

export function getEndingStyleInstruction(style: KoreanEndingStyle): string {
  switch (style) {
    case "formal":
      return `IMPORTANT: Use the formal polite style (합쇼체/hapsyo-che) consistently. End all sentences with -습니다/-ㅂ니다 endings (e.g., 갑니다, 합니다, 먹습니다). Do not mix with other speech levels.`
    case "informal":
      return `IMPORTANT: Use the informal polite style (해요체/haeyo-che) consistently. End all sentences with -요 endings (e.g., 가요, 해요, 먹어요). Do not mix with other speech levels.`
    case "plain":
      return `IMPORTANT: Use the plain/written style (해라체/haera-che) consistently. End all sentences with -다 endings (e.g., 간다, 한다, 먹는다). This is common for narrative text. Do not mix with other speech levels.`
  }
}

const BUILT_IN_PRESETS: TranslationPreset[] = [
  {
    id: "english-to-korean",
    name: "English \u2192 Korean",
    prompt: `Translate the following English text to Korean.
Use natural, conversational Korean suitable for reading aloud.
Avoid overly formal or literary vocabulary.
Keep the translation faithful to the original meaning while making it accessible to Korean learners.
Do not add any explanations or notes - just provide the translation.`,
    isBuiltIn: true,
  },
  {
    id: "german-to-korean",
    name: "German \u2192 Korean",
    prompt: `Translate the following German text to Korean.
Use natural, conversational Korean suitable for reading aloud.
Avoid overly formal or literary vocabulary.
Keep the translation faithful to the original meaning while making it accessible to Korean learners.
Do not add any explanations or notes - just provide the translation.`,
    isBuiltIn: true,
  },
  {
    id: "korean-to-simple-korean",
    name: "Korean \u2192 Simple Korean",
    prompt: `Rewrite the following Korean text in simpler Korean.
Use basic vocabulary and shorter sentences suitable for Korean language learners.
Avoid idioms, complex grammar structures, and advanced vocabulary.
Keep the meaning faithful to the original while making it easier to understand.
Do not add any explanations or notes - just provide the simplified version.`,
    isBuiltIn: true,
  },
]

export function getBuiltInPresets(): TranslationPreset[] {
  return BUILT_IN_PRESETS
}

export function getCustomPresets(): TranslationPreset[] {
  return customPresets
}

export function getAllPresets(): TranslationPreset[] {
  return [...BUILT_IN_PRESETS, ...getCustomPresets()]
}

export function getPresetById(id: string): TranslationPreset | undefined {
  return getAllPresets().find((p) => p.id === id)
}

export function getDefaultPreset(): TranslationPreset {
  return BUILT_IN_PRESETS[0]!
}

export function saveCustomPreset(preset: Omit<TranslationPreset, "id" | "isBuiltIn">): TranslationPreset {
  const newPreset: TranslationPreset = {
    ...preset,
    id: `custom-${crypto.randomUUID()}`,
    isBuiltIn: false,
  }

  customPresets = [...customPresets, newPreset]
  void putRecords(CUSTOM_PRESETS_STORE, [newPreset]).catch((error) => {
    console.error("Failed to persist custom preset:", error)
  })

  return newPreset
}

export function updateCustomPreset(
  id: string,
  updates: Partial<Omit<TranslationPreset, "id" | "isBuiltIn">>,
): TranslationPreset | null {
  let updatedPreset: TranslationPreset | null = null
  customPresets = customPresets.map((preset) => {
    if (preset.id !== id) return preset
    updatedPreset = {
      ...preset,
      ...updates,
      id: preset.id,
      isBuiltIn: false,
    }
    return updatedPreset
  })

  if (!updatedPreset) return null

  void putRecords(CUSTOM_PRESETS_STORE, [updatedPreset]).catch((error) => {
    console.error("Failed to persist custom preset:", error)
  })
  return updatedPreset
}

export function deleteCustomPreset(id: string): void {
  customPresets = customPresets.filter((p) => p.id !== id)
  void deleteRecord(CUSTOM_PRESETS_STORE, id).catch((error) => {
    console.error("Failed to delete custom preset:", error)
  })
}

function parseStoredPresets(stored: string): TranslationPreset[] {
  try {
    return JSON.parse(stored) as TranslationPreset[]
  } catch {
    return []
  }
}

// Check if a preset is Korean-to-Korean (needs ending style)
export function isKoreanToKoreanPreset(presetId: string | null, prompt: string): boolean {
  if (presetId === "korean-to-simple-korean") return true
  // Also check prompt content for custom presets
  const lowerPrompt = prompt.toLowerCase()
  return lowerPrompt.includes("korean") && lowerPrompt.includes("simpler korean")
}

// Build final prompt with ending style instruction if applicable
export function buildTranslationPrompt(basePrompt: string, endingStyle?: KoreanEndingStyle): string {
  if (!endingStyle) return basePrompt
  const styleInstruction = getEndingStyleInstruction(endingStyle)
  return `${basePrompt}\n\n${styleInstruction}`
}
