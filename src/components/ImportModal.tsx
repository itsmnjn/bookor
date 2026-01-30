import { type ChangeEvent, type DragEvent, useCallback, useState } from "react"
import { extractEpubMetadata } from "../lib/epubParser"
import { detectBookMetadata, isGeminiInitialized } from "../lib/gemini"
import { getAllPresets, getDefaultPreset } from "../lib/presets"
import type { TranslationPreset } from "../types/project"
import { CloseIcon, FileIcon, UploadIcon } from "./Icons"

type ImportMode = "upload" | "url"

interface ImportModalProps {
  onClose: () => void
  onImport: (file: File, title: string, author: string, preset: TranslationPreset) => void
}

export function ImportModal({ onClose, onImport }: ImportModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [gutenbergUrl, setGutenbergUrl] = useState("")
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchedFromUrl, setFetchedFromUrl] = useState(false)
  const [presets] = useState<TranslationPreset[]>(getAllPresets())
  const [selectedPresetId, setSelectedPresetId] = useState(getDefaultPreset().id)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const ext = droppedFile.name.toLowerCase().split(".").pop()
      if (ext === "epub" || ext === "txt" || droppedFile.type === "text/plain") {
        setFile(droppedFile)
        // Try to extract title from filename
        const nameWithoutExt = droppedFile.name.replace(/\.(epub|txt)$/i, "")
        if (!title) setTitle(nameWithoutExt)
      }
    }
  }, [title])

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      const nameWithoutExt = selectedFile.name.replace(/\.(epub|txt)$/i, "")
      if (!title) setTitle(nameWithoutExt)
    }
  }, [title])

  const handleFetchFromUrl = useCallback(async () => {
    if (!gutenbergUrl.trim()) return

    setIsFetching(true)
    setFetchError(null)

    try {
      const response = await fetch(`/api/fetch-gutenberg?url=${encodeURIComponent(gutenbergUrl)}`)
      const data = await response.json()

      if (!response.ok) {
        setFetchError(data.error || "Failed to fetch book")
        return
      }

      // Create a File object from the fetched text
      const blob = new Blob([data.text], { type: "text/plain" })
      const fetchedFile = new File([blob], "gutenberg-book.txt", { type: "text/plain" })
      setFile(fetchedFile)
      setFetchedFromUrl(true)

      // Try to extract book ID from URL for title suggestion
      const match = gutenbergUrl.match(/\/(\d+)\//)
      if (match && !title) {
        setTitle(`Gutenberg Book #${match[1]}`)
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch book")
    } finally {
      setIsFetching(false)
    }
  }, [gutenbergUrl, title])

  const handleDetectMetadata = useCallback(async () => {
    if (!file) return

    const ext = file.name.toLowerCase().split(".").pop()

    setIsDetecting(true)
    setDetectError(null)

    try {
      if (ext === "epub") {
        // EPUB: extract metadata directly from OPF
        const metadata = await extractEpubMetadata(file)
        if (metadata.title !== "Unknown") setTitle(metadata.title)
        if (metadata.author !== "Unknown") setAuthor(metadata.author)
      } else {
        // TXT: use Gemini AI detection
        if (!isGeminiInitialized()) {
          setDetectError("Please set your Gemini API key in Settings first")
          return
        }

        const text = await file.text()
        // Get first ~100 lines (or ~4000 chars, whichever is smaller)
        const lines = text.split(/\r?\n/).slice(0, 100)
        const sample = lines.join("\n").slice(0, 4000)

        const metadata = await detectBookMetadata(sample)
        if (metadata.title !== "Unknown") setTitle(metadata.title)
        if (metadata.author !== "Unknown") setAuthor(metadata.author)
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Failed to detect metadata")
    } finally {
      setIsDetecting(false)
    }
  }, [file])

  const handleSubmit = () => {
    if (file && title.trim()) {
      const selectedPreset = presets.find((p) => p.id === selectedPresetId) || getDefaultPreset()
      onImport(file, title.trim(), author.trim() || "Unknown", selectedPreset)
    }
  }

  const canSubmit = file && title.trim()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 className="modal__title">Import Book</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon className="icon" />
          </button>
        </header>

        <div className="modal__body">
          <div className="import-tabs">
            <button
              className={`import-tab ${importMode === "upload" ? "import-tab--active" : ""}`}
              onClick={() => setImportMode("upload")}
            >
              Upload File
            </button>
            <button
              className={`import-tab ${importMode === "url" ? "import-tab--active" : ""}`}
              onClick={() => setImportMode("url")}
            >
              From URL
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Book File</label>

            {importMode === "upload" ? (
              <div
                className={`dropzone ${isDragging ? "dropzone--active" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".epub,.txt"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                {file && !fetchedFromUrl
                  ? (
                    <div className="dropzone__file">
                      <FileIcon className="icon icon--lg" />
                      <span>{file.name}</span>
                    </div>
                  )
                  : (
                    <>
                      <div className="dropzone__icon">
                        <UploadIcon className="icon icon--lg" />
                      </div>
                      <p className="dropzone__text">Drop an .epub or .txt file</p>
                      <p className="dropzone__hint">EPUB recommended for best chapter detection</p>
                    </>
                  )}
              </div>
            ) : (
              <div className="url-input-group">
                <div className="url-input-row">
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://www.gutenberg.org/cache/epub/719/pg719.txt"
                    value={gutenbergUrl}
                    onChange={(e) => setGutenbergUrl(e.target.value)}
                    disabled={isFetching}
                  />
                  <button
                    className="btn btn--primary"
                    onClick={handleFetchFromUrl}
                    disabled={!gutenbergUrl.trim() || isFetching}
                  >
                    {isFetching ? <span className="spinner" /> : "Fetch"}
                  </button>
                </div>
                {fetchError && <p className="url-input-error">{fetchError}</p>}
                {file && fetchedFromUrl && (
                  <div className="url-input-success">
                    <FileIcon className="icon" />
                    <span>Fetched from Gutenberg</span>
                  </div>
                )}
                <p className="url-input-hint">
                  Paste a Project Gutenberg plain text URL (e.g., .../pg719.txt)
                </p>
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="title">Title & Author</label>
              {file && (
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={handleDetectMetadata}
                  disabled={isDetecting}
                >
                  {isDetecting ? <span className="spinner" /> : "Auto-detect"}
                </button>
              )}
            </div>
            {detectError && <p className="detect-error">{detectError}</p>}
            <input
              id="title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Demian"
            />
            <input
              id="author"
              type="text"
              className="form-input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Hermann Hesse"
              style={{ marginTop: "var(--space-sm)" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Translation Preset</label>
            <div className="preset-selector preset-selector--compact">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  className={`preset-btn ${selectedPresetId === preset.id ? "preset-btn--active" : ""}`}
                  onClick={() => setSelectedPresetId(preset.id)}
                >
                  <span className="preset-btn__name">{preset.name}</span>
                </button>
              ))}
            </div>
            <p className="form-hint">Choose how text will be translated in this project</p>
          </div>
        </div>

        <footer className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Import Book
          </button>
        </footer>
      </div>
    </div>
  )
}
