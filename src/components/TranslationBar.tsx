import { useEffect, useState } from "react"
import {
  getAllPresets,
  getEndingStyleInstruction,
  KOREAN_ENDING_STYLES,
} from "../lib/presets"
import type { KoreanEndingStyle, TranslationPreset } from "../types/project"
import { ChevronDownIcon, ChevronUpIcon } from "./Icons"

interface TranslationBarProps {
  translationPrompt: string
  koreanEndingStyle?: KoreanEndingStyle
  onUpdatePrompt: (prompt: string, endingStyle?: KoreanEndingStyle | null) => void
  onUpdateEndingStyle: (style: KoreanEndingStyle | undefined) => void
  onOpenSettings: () => void
}

export function TranslationBar({
  translationPrompt,
  koreanEndingStyle,
  onUpdatePrompt,
  onUpdateEndingStyle,
  onOpenSettings,
}: TranslationBarProps) {
  const [showPrompt, setShowPrompt] = useState(false)
  const presets = getAllPresets()

  // Find matching preset
  const matchingPreset = presets.find((p) => p.prompt === translationPrompt)
  const selectedPresetId = matchingPreset?.id ?? null

  // Set default ending style if not already set
  useEffect(() => {
    if (!koreanEndingStyle) {
      onUpdateEndingStyle("informal")
    }
  }, [koreanEndingStyle, onUpdateEndingStyle])

  const handleSelectPreset = (preset: TranslationPreset) => {
    // Keep current ending style or default to informal
    onUpdatePrompt(preset.prompt, koreanEndingStyle ?? "informal")
  }

  const handleEndingStyleChange = (style: KoreanEndingStyle) => {
    onUpdateEndingStyle(style)
  }

  return (
    <div className="translation-bar">
      <div className="translation-bar__main">
        <div className="translation-bar__presets">
          <span className="translation-bar__label">Preset</span>
          <div className="preset-selector preset-selector--compact">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`preset-btn preset-btn--compact ${selectedPresetId === preset.id ? "preset-btn--active" : ""}`}
                onClick={() => handleSelectPreset(preset)}
              >
                {preset.name}
              </button>
            ))}
            <button
              className="preset-btn preset-btn--compact preset-btn--more"
              onClick={onOpenSettings}
              title="Manage presets in settings"
            >
              More...
            </button>
          </div>
        </div>

        <div className="translation-bar__endings">
          <span className="translation-bar__label">Ending Style</span>
          <div className="ending-selector">
            {KOREAN_ENDING_STYLES.map((style) => (
              <button
                key={style.value}
                className={`ending-btn ${koreanEndingStyle === style.value ? "ending-btn--active" : ""}`}
                onClick={() => handleEndingStyleChange(style.value)}
                title={`${style.description} (${style.example})`}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="translation-bar__toggle"
          onClick={() => setShowPrompt(!showPrompt)}
          aria-expanded={showPrompt}
        >
          {showPrompt ? (
            <>
              <span>Hide Prompt</span>
              <ChevronUpIcon className="icon" />
            </>
          ) : (
            <>
              <span>Show Prompt</span>
              <ChevronDownIcon className="icon" />
            </>
          )}
        </button>
      </div>

      {showPrompt && (
        <div className="translation-bar__prompt">
          <div className="translation-bar__prompt-content">
            <pre className="translation-bar__prompt-text">{translationPrompt}</pre>
            {koreanEndingStyle && (
              <div className="translation-bar__prompt-addition">
                <span className="translation-bar__prompt-addition-label">+ Ending Style Instruction:</span>
                <pre className="translation-bar__prompt-text translation-bar__prompt-text--addition">
                  {getEndingStyleInstruction(koreanEndingStyle)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
