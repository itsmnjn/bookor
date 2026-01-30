import { useEffect, useState } from "react"
import { initGemini, isGeminiInitialized } from "../lib/gemini"
import { CloseIcon } from "./Icons"

interface SettingsPanelProps {
  translationPrompt: string
  onUpdatePrompt: (prompt: string) => void
  onClose: () => void
}

const API_KEY_STORAGE = "bookor_gemini_key"

export function SettingsPanel({ translationPrompt, onUpdatePrompt, onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState("")
  const [isConnected, setIsConnected] = useState(isGeminiInitialized())
  const [prompt, setPrompt] = useState(translationPrompt)

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

  const handlePromptChange = (value: string) => {
    setPrompt(value)
    onUpdatePrompt(value)
  }

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

          <section className="settings-section">
            <h3 className="settings-section__title">Translation Prompt</h3>
            <textarea
              className="form-textarea"
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Instructions for the AI translator..."
            />
            <p className="form-hint">
              This prompt is sent to Gemini along with each paragraph to translate. Customize it to get the translation
              style you want.
            </p>
          </section>
        </div>
      </aside>
    </>
  )
}
