import { useEffect, useState } from "react"
import { initGemini, isGeminiInitialized } from "../lib/gemini"
import { getAllPresets, getPresetById, saveCustomPreset, deleteCustomPreset } from "../lib/presets"
import type { TranslationPreset } from "../types/project"
import { CloseIcon, TrashIcon, PlusIcon } from "./Icons"

interface SettingsPanelProps {
  translationPrompt?: string
  onUpdatePrompt?: (prompt: string) => void
  onClose: () => void
}

const API_KEY_STORAGE = "bookor_gemini_key"

export function SettingsPanel({ translationPrompt, onUpdatePrompt, onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState("")
  const [isConnected, setIsConnected] = useState(isGeminiInitialized())
  const [presets, setPresets] = useState<TranslationPreset[]>(getAllPresets())
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState(translationPrompt ?? "")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [newPresetPrompt, setNewPresetPrompt] = useState("")

  const hasProject = translationPrompt !== undefined && onUpdatePrompt !== undefined

  // Find matching preset on mount
  useEffect(() => {
    if (hasProject) {
      const matchingPreset = presets.find((p) => p.prompt === translationPrompt)
      if (matchingPreset) {
        setSelectedPresetId(matchingPreset.id)
      } else {
        setSelectedPresetId(null)
      }
    }
  }, [])

  useEffect(() => {
    const savedKey = localStorage.getItem(API_KEY_STORAGE)
    if (savedKey) {
      setApiKey(savedKey)
      initGemini(savedKey)
      setIsConnected(true)
    }
  }, [])

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE, apiKey.trim())
      initGemini(apiKey.trim())
      setIsConnected(true)
    }
  }

  const handleSelectPreset = (presetId: string) => {
    if (!onUpdatePrompt) return
    const preset = getPresetById(presetId)
    if (preset) {
      setSelectedPresetId(presetId)
      setCustomPrompt(preset.prompt)
      onUpdatePrompt(preset.prompt)
    }
  }

  const handleCustomPromptChange = (value: string) => {
    if (!onUpdatePrompt) return
    setCustomPrompt(value)
    const matchingPreset = presets.find((p) => p.prompt === value)
    setSelectedPresetId(matchingPreset?.id ?? null)
    onUpdatePrompt(value)
  }

  const handleCreatePreset = () => {
    if (newPresetName.trim() && newPresetPrompt.trim()) {
      const newPreset = saveCustomPreset({
        name: newPresetName.trim(),
        prompt: newPresetPrompt.trim(),
      })
      setPresets(getAllPresets())
      if (onUpdatePrompt) {
        setSelectedPresetId(newPreset.id)
        setCustomPrompt(newPreset.prompt)
        onUpdatePrompt(newPreset.prompt)
      }
      setShowCreateForm(false)
      setNewPresetName("")
      setNewPresetPrompt("")
    }
  }

  const handleDeletePreset = (presetId: string) => {
    deleteCustomPreset(presetId)
    setPresets(getAllPresets())
    if (selectedPresetId === presetId && onUpdatePrompt) {
      const firstPreset = getAllPresets()[0]
      if (firstPreset) {
        setSelectedPresetId(firstPreset.id)
        setCustomPrompt(firstPreset.prompt)
        onUpdatePrompt(firstPreset.prompt)
      }
    }
  }

  const selectedPreset = selectedPresetId ? getPresetById(selectedPresetId) : null

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <aside className="settings-panel">
        <header className="settings-panel__header">
          <h2 className="settings-panel__title">Settings</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon className="icon" />
          </button>
        </header>

        <div className="settings-panel__body">
          <section className="settings-section">
            <h3 className="settings-section__title">Gemini API</h3>
            <div className="api-key-input">
              <input
                type="password"
                className="form-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
              <button className="btn btn--secondary" onClick={handleSaveApiKey}>
                Save
              </button>
            </div>
            <div className="api-status">
              <span
                className={`api-status__dot ${
                  isConnected ? "api-status__dot--connected" : "api-status__dot--disconnected"
                }`}
              />
              <span>{isConnected ? "Connected" : "Not connected"}</span>
            </div>
            <p className="form-hint">
              Get your API key from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                Google AI Studio
              </a>
            </p>
          </section>

          {hasProject && (
            <section className="settings-section">
              <h3 className="settings-section__title">Translation Preset</h3>
              <div className="preset-selector">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-btn ${selectedPresetId === preset.id ? "preset-btn--active" : ""}`}
                    onClick={() => handleSelectPreset(preset.id)}
                  >
                    <span className="preset-btn__name">{preset.name}</span>
                    {!preset.isBuiltIn && (
                      <button
                        className="preset-btn__delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePreset(preset.id)
                        }}
                        aria-label={`Delete ${preset.name}`}
                      >
                        <TrashIcon className="icon" />
                      </button>
                    )}
                  </button>
                ))}
                <button
                  className="preset-btn preset-btn--add"
                  onClick={() => setShowCreateForm(true)}
                >
                  <PlusIcon className="icon" />
                  <span>Custom</span>
                </button>
              </div>

              {showCreateForm && (
                <div className="preset-create-form">
                  <div className="form-group">
                    <label className="form-label">Preset Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Japanese to Korean"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Translation Prompt</label>
                    <textarea
                      className="form-textarea"
                      value={newPresetPrompt}
                      onChange={(e) => setNewPresetPrompt(e.target.value)}
                      placeholder="Instructions for the AI translator..."
                    />
                  </div>
                  <div className="preset-create-form__actions">
                    <button className="btn btn--secondary" onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn--primary"
                      onClick={handleCreatePreset}
                      disabled={!newPresetName.trim() || !newPresetPrompt.trim()}
                    >
                      Create Preset
                    </button>
                  </div>
                </div>
              )}

              {!showCreateForm && (
                <>
                  <h3 className="settings-section__title" style={{ marginTop: "var(--space-lg)" }}>
                    {selectedPreset?.isBuiltIn ? "Prompt Preview" : "Translation Prompt"}
                  </h3>
                  <textarea
                    className="form-textarea"
                    value={customPrompt}
                    onChange={(e) => handleCustomPromptChange(e.target.value)}
                    placeholder="Instructions for the AI translator..."
                    readOnly={selectedPreset?.isBuiltIn}
                  />
                  <p className="form-hint">
                    {selectedPreset?.isBuiltIn
                      ? "Built-in presets cannot be edited. Create a custom preset to modify."
                      : "This prompt is sent to Gemini along with each paragraph to translate."}
                  </p>
                </>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  )
}
