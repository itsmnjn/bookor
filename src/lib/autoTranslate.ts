import type {
  AutoTranslateFailure,
  AutoTranslateState,
  AutoTranslateStatus,
  Chapter,
  Paragraph,
  ParagraphLocator,
  Project,
} from "../types/project"

interface LocatedParagraph {
  chapter: Chapter
  paragraph: Paragraph
  chapterIndex: number
  paragraphIndex: number
}

export function createEmptyAutoTranslateState(now = Date.now()): AutoTranslateState {
  return {
    status: "idle",
    queue: [],
    currentIndex: 0,
    completedCount: 0,
    failed: [],
    updatedAt: now,
  }
}

export function normalizeAutoTranslateState(
  state: Partial<AutoTranslateState> | undefined,
  now = Date.now(),
  options: { pauseRunning?: boolean } = {},
): AutoTranslateState {
  const normalized: AutoTranslateState = {
    status: normalizeStatus(state?.status, options.pauseRunning ?? false),
    queue: Array.isArray(state?.queue) ? state.queue.filter(isParagraphLocator) : [],
    currentIndex: typeof state?.currentIndex === "number" ? Math.max(0, Math.floor(state.currentIndex)) : 0,
    completedCount: typeof state?.completedCount === "number" ? Math.max(0, Math.floor(state.completedCount)) : 0,
    failed: Array.isArray(state?.failed) ? state.failed.filter(isAutoTranslateFailure) : [],
    startedAt: typeof state?.startedAt === "number" ? state.startedAt : undefined,
    updatedAt: typeof state?.updatedAt === "number" ? state.updatedAt : now,
    completedAt: typeof state?.completedAt === "number" ? state.completedAt : undefined,
  }

  const queueLength = normalized.queue.length
  normalized.currentIndex = Math.min(normalized.currentIndex, queueLength)
  normalized.completedCount = Math.min(normalized.completedCount, normalized.currentIndex)

  if (normalized.status === "completed" && normalized.currentIndex < queueLength) {
    normalized.status = queueLength === 0 ? "idle" : "paused"
    normalized.completedAt = undefined
  }

  if (queueLength === 0 && normalized.status !== "running") {
    normalized.status = normalized.completedAt ? "completed" : "idle"
  }

  return normalized
}

export function normalizeProject(project: Project): Project {
  return {
    ...project,
    autoTranslate: normalizeAutoTranslateState(project.autoTranslate, project.updatedAt || Date.now()),
  }
}

export function normalizeStoredProject(project: Project): Project {
  return {
    ...project,
    autoTranslate: normalizeAutoTranslateState(project.autoTranslate, project.updatedAt || Date.now(), {
      pauseRunning: true,
    }),
  }
}

export function isParagraphEligibleForAutoTranslate(paragraph: Paragraph): boolean {
  return !paragraph.excluded && paragraph.translated.trim() === ""
}

export function createParagraphLocator(chapterId: string, paragraphId: string): ParagraphLocator {
  return { chapterId, paragraphId }
}

export function buildAutoTranslateQueue(project: Project): ParagraphLocator[] {
  const queue: ParagraphLocator[] = []

  for (const chapter of project.chapters) {
    for (const paragraph of chapter.paragraphs) {
      if (!isParagraphEligibleForAutoTranslate(paragraph)) continue
      queue.push(createParagraphLocator(chapter.id, paragraph.id))
    }
  }

  return queue
}

export function findParagraphByLocator(project: Project, locator: ParagraphLocator): LocatedParagraph | null {
  const chapterIndex = project.chapters.findIndex((chapter) => chapter.id === locator.chapterId)
  if (chapterIndex === -1) return null

  const chapter = project.chapters[chapterIndex]!
  const paragraphIndex = chapter.paragraphs.findIndex((paragraph) => paragraph.id === locator.paragraphId)
  if (paragraphIndex === -1) return null

  return {
    chapter,
    paragraph: chapter.paragraphs[paragraphIndex]!,
    chapterIndex,
    paragraphIndex,
  }
}

export function compactAutoTranslateState(
  project: Project,
  state: AutoTranslateState,
  now = Date.now(),
): AutoTranslateState {
  const normalized = normalizeAutoTranslateState(state, now)
  if (normalized.queue.length === 0) return normalized

  const processed = normalized.queue.slice(0, normalized.currentIndex)
  const remaining = normalized.queue
    .slice(normalized.currentIndex)
    .filter((locator) => {
      const match = findParagraphByLocator(project, locator)
      return match ? isParagraphEligibleForAutoTranslate(match.paragraph) : false
    })

  const queue = [...processed, ...remaining]
  const currentIndex = Math.min(normalized.currentIndex, queue.length)
  const completedCount = Math.min(normalized.completedCount, currentIndex)
  const processedKeys = new Set(processed.map(locatorToKey))
  const failed = normalized.failed.filter((entry) => processedKeys.has(locatorToKey(entry.locator)))

  if (queue.length === 0) {
    return {
      ...createEmptyAutoTranslateState(now),
      status: "completed",
      startedAt: normalized.startedAt,
      completedAt: normalized.completedAt ?? now,
      updatedAt: now,
    }
  }

  const status: AutoTranslateStatus = currentIndex >= queue.length
    ? "completed"
    : normalized.status === "idle"
      ? "paused"
      : normalized.status

  return {
    ...normalized,
    queue,
    currentIndex,
    completedCount,
    failed,
    status,
    completedAt: status === "completed" ? normalized.completedAt ?? now : undefined,
    updatedAt: now,
  }
}

export function createAutoTranslateRunState(project: Project, now = Date.now()): AutoTranslateState {
  const queue = buildAutoTranslateQueue(project)

  return {
    status: queue.length === 0 ? "completed" : "running",
    queue,
    currentIndex: 0,
    completedCount: 0,
    failed: [],
    startedAt: now,
    updatedAt: now,
    completedAt: queue.length === 0 ? now : undefined,
  }
}

export function pauseAutoTranslateState(state: AutoTranslateState, now = Date.now()): AutoTranslateState {
  const normalized = normalizeAutoTranslateState(state, now)
  if (normalized.queue.length === 0 || normalized.currentIndex >= normalized.queue.length) {
    return {
      ...normalized,
      status: normalized.queue.length === 0 ? "idle" : "completed",
      completedAt: normalized.queue.length === 0 ? normalized.completedAt : normalized.completedAt ?? now,
      updatedAt: now,
    }
  }

  return {
    ...normalized,
    status: "paused",
    updatedAt: now,
  }
}

export function completeAutoTranslateState(state: AutoTranslateState, now = Date.now()): AutoTranslateState {
  const normalized = normalizeAutoTranslateState(state, now)

  return {
    ...normalized,
    status: "completed",
    currentIndex: normalized.queue.length,
    completedCount: normalized.queue.length,
    completedAt: now,
    updatedAt: now,
  }
}

export function recordAutoTranslateFailure(
  state: AutoTranslateState,
  locator: ParagraphLocator,
  error: string,
  nextIndex: number,
  now = Date.now(),
): AutoTranslateState {
  const normalized = normalizeAutoTranslateState(state, now)
  const failure: AutoTranslateFailure = { locator, error }

  return {
    ...normalized,
    currentIndex: nextIndex,
    completedCount: nextIndex,
    failed: [...normalized.failed, failure],
    updatedAt: now,
  }
}

export function recordAutoTranslateSuccess(
  state: AutoTranslateState,
  nextIndex: number,
  now = Date.now(),
): AutoTranslateState {
  const normalized = normalizeAutoTranslateState(state, now)

  return {
    ...normalized,
    currentIndex: nextIndex,
    completedCount: nextIndex,
    updatedAt: now,
  }
}

export function hasResumableAutoTranslate(project: Project): boolean {
  const autoTranslate = normalizeAutoTranslateState(project.autoTranslate)
  return autoTranslate.status === "paused" && autoTranslate.currentIndex < autoTranslate.queue.length
}

export function locatorToKey(locator: ParagraphLocator): string {
  return `${locator.chapterId}:${locator.paragraphId}`
}

function normalizeStatus(status: AutoTranslateStatus | undefined, pauseRunning: boolean): AutoTranslateStatus {
  if (status === "running") return pauseRunning ? "paused" : "running"
  if (status === "paused" || status === "completed" || status === "idle") return status
  return "idle"
}

function isParagraphLocator(value: unknown): value is ParagraphLocator {
  if (!value || typeof value !== "object") return false
  const locator = value as ParagraphLocator
  return typeof locator.chapterId === "string" && typeof locator.paragraphId === "string"
}

function isAutoTranslateFailure(value: unknown): value is AutoTranslateFailure {
  if (!value || typeof value !== "object") return false
  const failure = value as AutoTranslateFailure
  return isParagraphLocator(failure.locator) && typeof failure.error === "string"
}
