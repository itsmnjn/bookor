import { useCallback, useEffect, useRef, useState } from "react"
import {
  compactAutoTranslateState,
  completeAutoTranslateState,
  createAutoTranslateRunState,
  findParagraphByLocator,
  hasResumableAutoTranslate,
  locatorToKey,
  normalizeProject,
  pauseAutoTranslateState,
  recordAutoTranslateFailure,
  recordAutoTranslateSuccess,
} from "../lib/autoTranslate"
import { downloadMarkdown, downloadPdf } from "../lib/export"
import { isGeminiInitialized, runProjectAutoTranslate, translateParagraph } from "../lib/gemini"
import { buildTranslationPrompt } from "../lib/presets"
import { saveProject } from "../lib/storage"
import type { Chapter, KoreanEndingStyle, Paragraph, ParagraphLocator, ParagraphStatus, Project } from "../types/project"
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
      if (para.excluded) continue
      total++
      if (para.status === "translated") translated++
      if (para.status === "reviewed") reviewed++
    }
  }

  return { translated, reviewed, total }
}

function updateProjectParagraph(
  project: Project,
  chapterId: string,
  paragraphId: string,
  updates: Partial<Paragraph>,
): Project {
  return {
    ...project,
    chapters: project.chapters.map((chapter) => {
      if (chapter.id !== chapterId) return chapter
      return {
        ...chapter,
        paragraphs: chapter.paragraphs.map((paragraph) => {
          if (paragraph.id !== paragraphId) return paragraph
          return { ...paragraph, ...updates }
        }),
      }
    }),
  }
}

function getParagraphRunKey(chapterId: string, paragraphId: string): string {
  return `${chapterId}:${paragraphId}`
}

function getAutoTranslateCurrentLabel(project: Project, locator: ParagraphLocator | null): string {
  if (!locator) return "No active passage"

  const match = findParagraphByLocator(project, locator)
  if (!match) return "Passage unavailable"

  const chapterLabel = match.chapter.title || `Chapter ${match.chapter.number}`
  return `${chapterLabel} • Passage ${match.paragraphIndex + 1}`
}

function getAutoTranslateStatusCopy(project: Project): string {
  const { autoTranslate } = project

  if (autoTranslate.status === "running") {
    return autoTranslate.failed.length > 0
      ? "Auto-translate is running. Failed passages are being skipped and logged."
      : "Auto-translate is running across all unfinished passages."
  }

  if (autoTranslate.status === "paused") {
    return "Auto-translate is paused. Resume will continue from the next unfinished passage."
  }

  if (autoTranslate.status === "completed") {
    if (autoTranslate.queue.length === 0) {
      return "No unfinished passages were found."
    }

    return autoTranslate.failed.length > 0
      ? "Auto-translate finished with some failed passages that can be retried later."
      : "Auto-translate finished for every queued passage."
  }

  return ""
}

export function Editor({ project, onBack, onOpenSettings, onUpdateProject }: EditorProps) {
  const [activeChapterId, setActiveChapterId] = useState(project.chapters[0]?.id || "")
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [showExportMenu, setShowExportMenu] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef<Project>(normalizeProject(project))
  const onUpdateProjectRef = useRef(onUpdateProject)
  const autoTranslateControllerRef = useRef<AbortController | null>(null)

  const normalizedProject = normalizeProject(project)
  const activeChapter = normalizedProject.chapters.find((chapter) => chapter.id === activeChapterId)
  const progress = getProjectProgress(normalizedProject)
  const autoTranslate = normalizedProject.autoTranslate
  const isAutoTranslating = autoTranslate.status === "running"
  const hasResume = hasResumableAutoTranslate(normalizedProject)
  const showAutoTranslatePanel = autoTranslate.status !== "idle" || autoTranslate.queue.length > 0
  const currentLocator = autoTranslate.queue[autoTranslate.currentIndex] ?? null
  const currentLabel = getAutoTranslateCurrentLabel(normalizedProject, currentLocator)
  const processedCount = autoTranslate.completedCount
  const failedCount = autoTranslate.failed.length
  const successCount = Math.max(0, processedCount - failedCount)

  useEffect(() => {
    projectRef.current = normalizedProject
  }, [normalizedProject])

  useEffect(() => {
    onUpdateProjectRef.current = onUpdateProject
  }, [onUpdateProject])

  useEffect(() => {
    if (!normalizedProject.chapters.some((chapter) => chapter.id === activeChapterId)) {
      setActiveChapterId(normalizedProject.chapters[0]?.id || "")
    }
  }, [normalizedProject, activeChapterId])

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [activeChapterId])

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

  useEffect(() => {
    return () => {
      const controller = autoTranslateControllerRef.current
      if (!controller) return

      controller.abort()
      autoTranslateControllerRef.current = null

      const currentProject = projectRef.current
      if (currentProject.autoTranslate.status === "running") {
        const pausedProject = {
          ...currentProject,
          autoTranslate: pauseAutoTranslateState(currentProject.autoTranslate),
        }
        const normalizedPausedProject = normalizeProject(pausedProject)
        projectRef.current = normalizedPausedProject
        saveProject(normalizedPausedProject)
      }
    }
  }, [])

  const syncProject = useCallback((nextProject: Project) => {
    const normalizedNextProject = normalizeProject(nextProject)
    projectRef.current = normalizedNextProject
    onUpdateProjectRef.current(normalizedNextProject)
    return normalizedNextProject
  }, [])

  const persistProjectOnly = useCallback((nextProject: Project) => {
    const normalizedNextProject = normalizeProject(nextProject)
    projectRef.current = normalizedNextProject
    saveProject(normalizedNextProject)
    return normalizedNextProject
  }, [])

  const setActiveTranslation = useCallback((locator: ParagraphLocator | null) => {
    if (!locator) {
      setTranslatingIds(new Set())
      return
    }

    setTranslatingIds(new Set([locatorToKey(locator)]))
  }, [])

  const updateParagraph = useCallback((chapterId: string, paragraphId: string, updates: Partial<Paragraph>) => {
    const nextProject = updateProjectParagraph(projectRef.current, chapterId, paragraphId, updates)
    syncProject(nextProject)
  }, [syncProject])

  const pauseActiveAutoTranslate = useCallback((persistToParent = true) => {
    const controller = autoTranslateControllerRef.current
    if (!controller) return

    controller.abort()
    autoTranslateControllerRef.current = null
    setActiveTranslation(null)

    const currentProject = projectRef.current
    if (currentProject.autoTranslate.status !== "running") return

    const pausedProject = {
      ...currentProject,
      autoTranslate: pauseAutoTranslateState(currentProject.autoTranslate),
    }

    if (persistToParent) {
      syncProject(pausedProject)
    } else {
      persistProjectOnly(pausedProject)
    }
  }, [persistProjectOnly, setActiveTranslation, syncProject])

  const handleTranslate = useCallback(async (paragraph: Paragraph) => {
    if (isAutoTranslating) return

    const currentProject = projectRef.current
    const chapter = currentProject.chapters.find((entry) => entry.id === activeChapterId)
    if (!chapter) return

    const runKey = getParagraphRunKey(chapter.id, paragraph.id)
    setTranslatingIds((prev) => new Set(prev).add(runKey))

    try {
      const fullPrompt = buildTranslationPrompt(currentProject.translationPrompt, currentProject.koreanEndingStyle)
      const translation = await translateParagraph(paragraph, fullPrompt)
      updateParagraph(chapter.id, paragraph.id, {
        translated: translation,
        status: "translated",
      })
    } catch (error) {
      console.error("Translation failed:", error)
      alert("Translation failed. Make sure your API key is set in settings.")
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev)
        next.delete(runKey)
        return next
      })
    }
  }, [activeChapterId, isAutoTranslating, updateParagraph])

  const handleMarkReviewed = useCallback((paragraph: Paragraph) => {
    const chapter = projectRef.current.chapters.find((entry) => entry.id === activeChapterId)
    if (!chapter) return
    updateParagraph(chapter.id, paragraph.id, { status: "reviewed" })
  }, [activeChapterId, updateParagraph])

  const handleTextChange = useCallback((paragraph: Paragraph, text: string) => {
    const chapter = projectRef.current.chapters.find((entry) => entry.id === activeChapterId)
    if (!chapter) return
    updateParagraph(chapter.id, paragraph.id, { translated: text })
  }, [activeChapterId, updateParagraph])

  const handleToggleExcluded = useCallback((paragraph: Paragraph) => {
    if (isAutoTranslating) return

    const chapter = projectRef.current.chapters.find((entry) => entry.id === activeChapterId)
    if (!chapter) return

    updateParagraph(chapter.id, paragraph.id, { excluded: !paragraph.excluded })
  }, [activeChapterId, isAutoTranslating, updateParagraph])

  const handleUpdatePrompt = useCallback((prompt: string, endingStyle?: KoreanEndingStyle | null) => {
    const currentProject = projectRef.current
    const updates: Partial<Project> = { translationPrompt: prompt }
    if (endingStyle === null) {
      updates.koreanEndingStyle = undefined
    } else if (endingStyle !== undefined) {
      updates.koreanEndingStyle = endingStyle
    }
    syncProject({ ...currentProject, ...updates })
  }, [syncProject])

  const handleUpdateEndingStyle = useCallback((style: KoreanEndingStyle | undefined) => {
    const currentProject = projectRef.current
    syncProject({
      ...currentProject,
      koreanEndingStyle: style,
    })
  }, [syncProject])

  const handleAutoTranslate = useCallback(async (mode: "start" | "resume") => {
    if (autoTranslateControllerRef.current) return
    if (!isGeminiInitialized()) {
      alert("Set your Gemini API key in settings before starting auto-translate.")
      return
    }

    const currentProject = projectRef.current
    const now = Date.now()
    const nextAutoTranslate = mode === "start"
      ? createAutoTranslateRunState(currentProject, now)
      : compactAutoTranslateState(currentProject, currentProject.autoTranslate, now)

    if (nextAutoTranslate.queue.length === 0 || nextAutoTranslate.currentIndex >= nextAutoTranslate.queue.length) {
      setActiveTranslation(null)
      syncProject({
        ...currentProject,
        autoTranslate: completeAutoTranslateState(nextAutoTranslate, now),
      })
      return
    }

    const runningAutoTranslate = {
      ...nextAutoTranslate,
      status: "running" as const,
      startedAt: nextAutoTranslate.startedAt ?? now,
      completedAt: undefined,
      updatedAt: now,
    }

    const runningProject = syncProject({
      ...currentProject,
      autoTranslate: runningAutoTranslate,
    })

    const controller = new AbortController()
    autoTranslateControllerRef.current = controller

    const fullPrompt = buildTranslationPrompt(runningProject.translationPrompt, runningProject.koreanEndingStyle)

    try {
      const result = await runProjectAutoTranslate({
        project: runningProject,
        queue: runningAutoTranslate.queue,
        prompt: fullPrompt,
        startIndex: runningAutoTranslate.currentIndex,
        signal: controller.signal,
        onItemStart: (locator) => {
          setActiveTranslation(locator)
        },
        onItemSuccess: (locator, translation, index) => {
          const currentSnapshot = projectRef.current
          const nextAutoTranslateState = recordAutoTranslateSuccess(currentSnapshot.autoTranslate, index + 1)
          const updatedProject = updateProjectParagraph(
            currentSnapshot,
            locator.chapterId,
            locator.paragraphId,
            { translated: translation, status: "translated" },
          )

          syncProject({
            ...updatedProject,
            autoTranslate: index + 1 >= nextAutoTranslateState.queue.length
              ? completeAutoTranslateState(nextAutoTranslateState)
              : nextAutoTranslateState,
          })
        },
        onItemFailure: (locator, error, index) => {
          const currentSnapshot = projectRef.current
          const nextAutoTranslateState = recordAutoTranslateFailure(
            currentSnapshot.autoTranslate,
            locator,
            error.message,
            index + 1,
          )

          syncProject({
            ...currentSnapshot,
            autoTranslate: index + 1 >= nextAutoTranslateState.queue.length
              ? completeAutoTranslateState(nextAutoTranslateState)
              : nextAutoTranslateState,
          })
        },
      })

      autoTranslateControllerRef.current = null
      setActiveTranslation(null)

      if (result.status === "aborted") {
        const currentSnapshot = projectRef.current
        if (currentSnapshot.autoTranslate.status === "running") {
          syncProject({
            ...currentSnapshot,
            autoTranslate: pauseAutoTranslateState(currentSnapshot.autoTranslate),
          })
        }
        return
      }

      const currentSnapshot = projectRef.current
      if (currentSnapshot.autoTranslate.status !== "completed") {
        syncProject({
          ...currentSnapshot,
          autoTranslate: completeAutoTranslateState(currentSnapshot.autoTranslate),
        })
      }
    } catch (error) {
      autoTranslateControllerRef.current = null
      setActiveTranslation(null)
      console.error("Auto-translate failed:", error)

      const currentSnapshot = projectRef.current
      if (currentSnapshot.autoTranslate.status === "running") {
        syncProject({
          ...currentSnapshot,
          autoTranslate: pauseAutoTranslateState(currentSnapshot.autoTranslate),
        })
      }

      alert("Auto-translate stopped unexpectedly. You can resume from the last unfinished passage.")
    }
  }, [setActiveTranslation, syncProject])

  const handleBack = useCallback(() => {
    if (isAutoTranslating) {
      pauseActiveAutoTranslate(true)
    }

    onBack()
  }, [isAutoTranslating, onBack, pauseActiveAutoTranslate])

  return (
    <div className="editor">
      <header className="editor__topbar">
        <button className="editor__back" onClick={handleBack}>
          <ArrowLeftIcon className="icon" />
          <span>Projects</span>
        </button>

        <h1 className="editor__title">{normalizedProject.title}</h1>

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
                    downloadMarkdown(normalizedProject)
                    setShowExportMenu(false)
                  }}
                >
                  Export as Markdown
                </button>
                <button
                  className="export-menu__item"
                  onClick={() => {
                    downloadPdf(normalizedProject)
                    setShowExportMenu(false)
                  }}
                >
                  Export as PDF
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn--ghost"
            onClick={onOpenSettings}
            aria-label="Settings"
            disabled={isAutoTranslating}
          >
            <SettingsIcon className="icon icon--lg" />
          </button>
        </div>
      </header>

      {hasResume && (
        <div className="auto-translate-banner">
          <div>
            <strong>Auto-translate paused</strong>
            <p>
              Resume will continue from {currentLabel}.
            </p>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => void handleAutoTranslate("resume")}>
            Resume
          </button>
        </div>
      )}

      <TranslationBar
        translationPrompt={normalizedProject.translationPrompt}
        koreanEndingStyle={normalizedProject.koreanEndingStyle}
        onUpdatePrompt={handleUpdatePrompt}
        onUpdateEndingStyle={handleUpdateEndingStyle}
        onOpenSettings={onOpenSettings}
        disabled={isAutoTranslating}
      />

      <aside className="sidebar">
        <div className="sidebar__section">
          <div className="sidebar__heading-row">
            <h2 className="sidebar__heading">Chapters</h2>
            {!isAutoTranslating && !hasResume && (
              <button className="btn btn--secondary btn--sm" onClick={() => void handleAutoTranslate("start")}>
                Auto-Translate
              </button>
            )}
            {!isAutoTranslating && hasResume && (
              <button className="btn btn--primary btn--sm" onClick={() => void handleAutoTranslate("resume")}>
                Resume
              </button>
            )}
            {isAutoTranslating && (
              <button className="btn btn--danger btn--sm" onClick={() => pauseActiveAutoTranslate(true)}>
                Pause
              </button>
            )}
          </div>

          {showAutoTranslatePanel && (
            <section className={`auto-translate-panel auto-translate-panel--${autoTranslate.status}`}>
              <div className="auto-translate-panel__header">
                <span className="auto-translate-panel__eyebrow">Auto-Translate</span>
                <span className={`status-badge status-badge--${autoTranslate.status}`}>
                  {autoTranslate.status}
                </span>
              </div>

              <p className="auto-translate-panel__copy">{getAutoTranslateStatusCopy(normalizedProject)}</p>

              <div className="auto-translate-panel__stats">
                <div>
                  <span className="auto-translate-panel__stat-label">Processed</span>
                  <strong>{processedCount}/{autoTranslate.queue.length}</strong>
                </div>
                <div>
                  <span className="auto-translate-panel__stat-label">Succeeded</span>
                  <strong>{successCount}</strong>
                </div>
                <div>
                  <span className="auto-translate-panel__stat-label">Failed</span>
                  <strong>{failedCount}</strong>
                </div>
              </div>

              <div className="auto-translate-panel__current">
                <span className="auto-translate-panel__stat-label">Current</span>
                <strong>{currentLabel}</strong>
              </div>

              {autoTranslate.failed.length > 0 && (
                <div className="auto-translate-panel__failures">
                  <span className="auto-translate-panel__stat-label">Failures</span>
                  <ul>
                    {autoTranslate.failed.slice(0, 3).map((failure) => (
                      <li key={`${locatorToKey(failure.locator)}-${failure.error}`}>
                        <strong>{getAutoTranslateCurrentLabel(normalizedProject, failure.locator)}</strong>
                        <span>{failure.error}</span>
                      </li>
                    ))}
                  </ul>
                  {autoTranslate.failed.length > 3 && (
                    <p className="auto-translate-panel__overflow">
                      +{autoTranslate.failed.length - 3} more failed passages
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {normalizedProject.chapters.map((chapter) => {
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
                  const isTranslating = translatingIds.has(getParagraphRunKey(activeChapter.id, paragraph.id))

                  return (
                    <article
                      key={paragraph.id}
                      className={`paragraph-pair paragraph-pair--${paragraph.status}${
                        paragraph.excluded ? " paragraph-pair--excluded" : ""
                      }${isTranslating ? " paragraph-pair--translating" : ""}`}
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
                              disabled={isAutoTranslating}
                            >
                              {paragraph.excluded ? <EyeIcon className="icon" /> : <EyeOffIcon className="icon" />}
                            </button>
                            <button
                              className="btn btn--secondary btn--sm"
                              onClick={() => void handleTranslate(paragraph)}
                              disabled={isTranslating || isAutoTranslating}
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
