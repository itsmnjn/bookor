import { useCallback, useEffect, useRef, useState } from "react"
import { translateParagraph } from "../lib/gemini"
import type { Chapter, Paragraph, ParagraphStatus, Project } from "../types/project"
import { ArrowLeftIcon, CheckIcon, EyeIcon, EyeOffIcon, RefreshIcon, SettingsIcon } from "./Icons"
import { ProgressBar } from "./ProgressBar"

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
      if (para.excluded) continue  // Skip excluded paragraphs
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
  const contentRef = useRef<HTMLElement>(null)

  const activeChapter = project.chapters.find(ch => ch.id === activeChapterId)
  const progress = getProjectProgress(project)

  // Scroll to top when chapter changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [activeChapterId])

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
      const translation = await translateParagraph(paragraph, project.translationPrompt)
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
  }, [activeChapter, project.translationPrompt, updateParagraph])

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
          <button className="btn btn--ghost" onClick={onOpenSettings} aria-label="Settings">
            <SettingsIcon className="icon icon--lg" />
          </button>
        </div>
      </header>

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
                      className={`paragraph-pair paragraph-pair--${paragraph.status}${paragraph.excluded ? ' paragraph-pair--excluded' : ''}`}
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
                              rows={5}
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
                            <span className={`status-badge status-badge--${paragraph.excluded ? 'excluded' : paragraph.status}`}>
                              {paragraph.excluded ? 'excluded' : paragraph.status}
                            </span>
                          </div>

                          <div className="paragraph-pair__action-buttons">
                            <button
                              className={`btn btn--ghost btn--sm${paragraph.excluded ? ' btn--active' : ''}`}
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
