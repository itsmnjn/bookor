import type { TranslationPreset } from "../types/project"

const CUSTOM_PRESETS_STORAGE = "bookor_custom_presets"

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
  const stored = localStorage.getItem(CUSTOM_PRESETS_STORAGE)
  if (!stored) return []
  try {
    return JSON.parse(stored) as TranslationPreset[]
  } catch {
    return []
  }
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
    id: `custom-${Date.now()}`,
    isBuiltIn: false,
  }

  const customPresets = getCustomPresets()
  customPresets.push(newPreset)
  localStorage.setItem(CUSTOM_PRESETS_STORAGE, JSON.stringify(customPresets))

  return newPreset
}

export function deleteCustomPreset(id: string): void {
  const customPresets = getCustomPresets().filter((p) => p.id !== id)
  localStorage.setItem(CUSTOM_PRESETS_STORAGE, JSON.stringify(customPresets))
}
