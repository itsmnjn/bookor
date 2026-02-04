import { useCallback, useEffect, useRef, useState } from "react"
import { downloadMarkdown, downloadPdf } from "../lib/export"
import { translateParagraph } from "../lib/gemini"
import { buildTranslationPrompt } from "../lib/presets"
import type { Chapter, KoreanEndingStyle, Paragraph, ParagraphStatus, Project } from "../types/project"
import { ArrowLeftIcon, CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, RefreshIcon, SettingsIcon } from "./Icons"
import { ProgressBar } from "./ProgressBar"
import { TranslationBar } from "./TranslationBar"

interface EditorProps {
  project: Project
  onBack: () => void
  onOpenSettings: () => void
  onUpdateProject: (project: Project) => void
}

function getChapterStatus(chapter: Chapter): ParagraphStatus {
  const hasReviewed = chapter.paragraphs.some(p => p.status === "reviewed")
  const allReviewed = chapter.paragraphs.every(p => p.status === "reviewed")
  const hasTranslated = chapter.paragraphs.some(p => p.status === "translated" || p.status === "reviewed")
  const allTranslated = chapter.paragraphs.every(p => p.status === "translated" || p.status === "reviewed")

  if (allReviewed) return "reviewed"
  if (allTranslated) return "translated"
  if (hasReviewed || hasTranslated) return "translated"
  return "pending"
}

function getProjectProgress(project: Project) {
  let translated = 0
  let reviewed = 0
  let total = 0

  for (const chapter of project.chapters) {
    for (const para of chapter.paragraphs) {
      if (para.excluded) continue // Skip excluded paragraphs
      total++
      if (para.status === "translated") translated++
      if (para.status === "reviewed") reviewed++
    }
  }

  return { translated, reviewed, total }
}

export function Editor({ project, onBack, onOpenSettings, onUpdateProject }: EditorProps) {
  const [activeChapterId, setActiveChapterId] = useState(project.chapters[0]?.id || "")
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [showExportMenu, setShowExportMenu] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  const activeChapter = project.chapters.find(ch => ch.id === activeChapterId)
  const progress = getProjectProgress(project)

  // Scroll to top when chapter changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [activeChapterId])

  // Close export menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showExportMenu])

  const updateParagraph = useCallback((chapterId: string, paragraphId: string, updates: Partial<Paragraph>) => {
    const newChapters = project.chapters.map(ch => {
      if (ch.id !== chapterId) return ch
      return {
        ...ch,
        paragraphs: ch.paragraphs.map(p => {
          if (p.id !== paragraphId) return p
          return { ...p, ...updates }
        }),
      }
    })

    onUpdateProject({
      ...project,
      chapters: newChapters,
    })
  }, [project, onUpdateProject])

  const handleTranslate = useCallback(async (paragraph: Paragraph) => {
    if (!activeChapter) return

    setTranslatingIds(prev => new Set(prev).add(paragraph.id))

    try {
      // Build the full prompt including ending style if applicable
      const fullPrompt = buildTranslationPrompt(project.translationPrompt, project.koreanEndingStyle)
      const translation = await translateParagraph(paragraph, fullPrompt)
      updateParagraph(activeChapter.id, paragraph.id, {
        translated: translation,
        status: "translated",
      })
    } catch (error) {
      console.error("Translation failed:", error)
      alert("Translation failed. Make sure your API key is set in settings.")
    } finally {
      setTranslatingIds(prev => {
        const next = new Set(prev)
        next.delete(paragraph.id)
        return next
      })
    }
  }, [activeChapter, project.translationPrompt, project.koreanEndingStyle, updateParagraph])

  const handleMarkReviewed = useCallback((paragraph: Paragraph) => {
    if (!activeChapter) return
    updateParagraph(activeChapter.id, paragraph.id, { status: "reviewed" })
  }, [activeChapter, updateParagraph])

  const handleTextChange = useCallback((paragraph: Paragraph, text: string) => {
    if (!activeChapter) return
    updateParagraph(activeChapter.id, paragraph.id, { translated: text })
  }, [activeChapter, updateParagraph])

  const handleToggleExcluded = useCallback((paragraph: Paragraph) => {
    if (!activeChapter) return
    updateParagraph(activeChapter.id, paragraph.id, { excluded: !paragraph.excluded })
  }, [activeChapter, updateParagraph])

  // Combined update to avoid race conditions when changing preset
  const handleUpdatePrompt = useCallback((prompt: string, endingStyle?: KoreanEndingStyle | null) => {
    const updates: Partial<Project> = { translationPrompt: prompt }
    // null = clear ending style, undefined = keep current
    if (endingStyle === null) {
      updates.koreanEndingStyle = undefined
    } else if (endingStyle !== undefined) {
      updates.koreanEndingStyle = endingStyle
    }
    onUpdateProject({ ...project, ...updates })
  }, [project, onUpdateProject])

  const handleUpdateEndingStyle = useCallback((style: KoreanEndingStyle | undefined) => {
    onUpdateProject({
      ...project,
      koreanEndingStyle: style,
    })
  }, [project, onUpdateProject])

  return (
    <div className="editor">
      <header className="editor__topbar">
        <button className="editor__back" onClick={onBack}>
          <ArrowLeftIcon className="icon" />
          <span>Projects</span>
        </button>

        <h1 className="editor__title">{project.title}</h1>

        <div className="editor__progress">
          <ProgressBar
            translated={progress.translated}
            reviewed={progress.reviewed}
            total={progress.total}
            className="editor__progress-bar"
          />
          <span className="editor__progress-text">
            {progress.reviewed}/{progress.total}
          </span>
        </div>

        <div className="editor__actions">
          <div className="export-menu-container" ref={exportMenuRef}>
            <button
              className="btn btn--ghost"
              onClick={() => setShowExportMenu(!showExportMenu)}
              aria-label="Export"
              title="Export reviewed translations"
            >
              <DownloadIcon className="icon icon--lg" />
            </button>

            {showExportMenu && (
              <div className="export-menu">
                <button
                  className="export-menu__item"
                  onClick={() => {
                    downloadMarkdown(project)
                    setShowExportMenu(false)
                  }}
                >
                  Export as Markdown
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    downloadPdf(project)
                    setShowExportMenu(false)
                  }}
                >
                  Export as PDF
                </button>
              </div>
            )}
          </div>
          <button className="btn btn--ghost" onClick={onOpenSettings} aria-label="Settings">
            <SettingsIcon className="icon icon--lg" />
          </button>
        </div>
      </header>

      <TranslationBar
        translationPrompt={project.translationPrompt}
        koreanEndingStyle={project.koreanEndingStyle}
        onUpdatePrompt={handleUpdatePrompt}
        onUpdateEndingStyle={handleUpdateEndingStyle}
        onOpenSettings={onOpenSettings}
      />

      <aside className="sidebar">
        <div className="sidebar__section">
          <h2 className="sidebar__heading">Chapters</h2>
          {project.chapters.map((chapter) => {
            const status = getChapterStatus(chapter)
            return (
              <button
                key={chapter.id}
                className={`chapter-item ${chapter.id === activeChapterId ? "chapter-item--active" : ""}`}
                onClick={() => setActiveChapterId(chapter.id)}
              >
                <span className="chapter-item__number">{chapter.number}</span>
                <span className="chapter-item__title">{chapter.title}</span>
                <span className={`chapter-item__status chapter-item__status--${status}`} />
              </button>
            )
          })}
        </div>
      </aside>

      <main className="editor__content" ref={contentRef}>
        {activeChapter
          ? (
            <>
              <div className="chapter-header">
                <h2 className="chapter-header__title">{activeChapter.title}</h2>
                <p className="chapter-header__meta">
                  {activeChapter.paragraphs.length} paragraphs
                </p>
              </div>

              <div className="paragraph-list">
                {activeChapter.paragraphs.map((paragraph) => {
                  const isTranslating = translatingIds.has(paragraph.id)

                  return (
                    <article
                      key={paragraph.id}
                      className={`paragraph-pair paragraph-pair--${paragraph.status}${
                        paragraph.excluded ? " paragraph-pair--excluded" : ""
                      }`}
                    >
                      <div className="paragraph-pair__side paragraph-pair__side--original">
                        <div className="paragraph-pair__label">English</div>
                        <p className="paragraph-pair__text">{paragraph.original}</p>
                      </div>

                      <div className="paragraph-pair__divider" />

                      <div className="paragraph-pair__side">
                        <div className="paragraph-pair__label">Korean</div>
                        {paragraph.translated
                          ? (
                            <textarea
                              className="paragraph-pair__textarea"
                              value={paragraph.translated}
                              onChange={(e) => handleTextChange(paragraph, e.target.value)}
                              placeholder="Translation will appear here..."
                              rows={10}
                            />
                          )
                          : (
                            <p
                              className="paragraph-pair__text paragraph-pair__text--korean"
                              style={{ color: "var(--text-muted)", fontStyle: "italic" }}
                            >
                              {isTranslating ? "Translating..." : "Not translated yet"}
                            </p>
                          )}

                        <div className="paragraph-pair__actions">
                          <div className="paragraph-pair__status-area">
                            <span
                              className={`status-badge status-badge--${
                                paragraph.excluded ? "excluded" : paragraph.status
                              }`}
                            >
                              {paragraph.excluded ? "excluded" : paragraph.status}
                            </span>
                          </div>

                          <div className="paragraph-pair__action-buttons">
                            <button
                              className={`btn btn--ghost btn--sm${paragraph.excluded ? " btn--active" : ""}`}
                              onClick={() => handleToggleExcluded(paragraph)}
                              title={paragraph.excluded ? "Include paragraph" : "Exclude paragraph"}
                            >
                              {paragraph.excluded ? <EyeIcon className="icon" /> : <EyeOffIcon className="icon" />}
                            </button>
                            <button
                              className="btn btn--secondary btn--sm"
                              onClick={() => handleTranslate(paragraph)}
                              disabled={isTranslating}
                            >
                              {isTranslating ? <span className="spinner" /> : <RefreshIcon className="icon" />}
                              {paragraph.translated ? "Re-translate" : "Translate"}
                            </button>

                            {paragraph.translated && paragraph.status !== "reviewed" && (
                              <button
                                className="btn btn--primary btn--sm"
                                onClick={() => handleMarkReviewed(paragraph)}
                              >
                                <CheckIcon className="icon" />
                                Mark Reviewed
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )
          : (
            <div className="empty-chapter">
              <p>No chapters found in this book.</p>
            </div>
          )}
      </main>
    </div>
  )
}
