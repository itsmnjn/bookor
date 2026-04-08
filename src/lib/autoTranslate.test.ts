import { describe, expect, test } from "bun:test"
import {
  buildAutoTranslateQueue,
  compactAutoTranslateState,
  createEmptyAutoTranslateState,
  normalizeProject,
  normalizeStoredProject,
} from "./autoTranslate"
import type { Project } from "../types/project"

function createProject(): Project {
  return {
    id: "proj-1",
    title: "Test Book",
    author: "Author",
    translationPrompt: "Translate this.",
    autoTranslate: createEmptyAutoTranslateState(1),
    createdAt: 1,
    updatedAt: 1,
    chapters: [
      {
        id: "ch-1",
        title: "One",
        number: 1,
        paragraphs: [
          { id: "p-0", original: "First", translated: "", status: "pending", excluded: false },
          { id: "p-1", original: "Second", translated: "Done", status: "translated", excluded: false },
          { id: "p-2", original: "Third", translated: "", status: "pending", excluded: true },
        ],
      },
      {
        id: "ch-2",
        title: "Two",
        number: 2,
        paragraphs: [
          { id: "p-0", original: "Fourth", translated: "", status: "pending", excluded: false },
        ],
      },
    ],
  }
}

describe("auto translate helpers", () => {
  test("buildAutoTranslateQueue only includes unfinished non-excluded passages", () => {
    const project = createProject()

    expect(buildAutoTranslateQueue(project)).toEqual([
      { chapterId: "ch-1", paragraphId: "p-0" },
      { chapterId: "ch-2", paragraphId: "p-0" },
    ])
  })

  test("compactAutoTranslateState removes no-longer-eligible remaining passages", () => {
    const project = createProject()
    const state = {
      status: "paused" as const,
      queue: [
        { chapterId: "ch-1", paragraphId: "p-0" },
        { chapterId: "ch-2", paragraphId: "p-0" },
      ],
      currentIndex: 1,
      completedCount: 1,
      failed: [],
      startedAt: 1,
      updatedAt: 1,
    }

    const updatedProject: Project = {
      ...project,
      chapters: project.chapters.map((chapter) => {
        if (chapter.id !== "ch-2") return chapter
        return {
          ...chapter,
          paragraphs: chapter.paragraphs.map((paragraph) => (
            paragraph.id === "p-0"
              ? { ...paragraph, translated: "Manual translation", status: "translated" }
              : paragraph
          )),
        }
      }),
    }

    const compacted = compactAutoTranslateState(updatedProject, state, 2)

    expect(compacted.queue).toEqual([{ chapterId: "ch-1", paragraphId: "p-0" }])
    expect(compacted.currentIndex).toBe(1)
    expect(compacted.completedCount).toBe(1)
    expect(compacted.status).toBe("completed")
  })

  test("normalizeStoredProject converts stale running state into paused", () => {
    const project = createProject()

    const normalized = normalizeStoredProject({
      ...project,
      autoTranslate: {
        ...project.autoTranslate,
        status: "running",
        queue: [{ chapterId: "ch-1", paragraphId: "p-0" }],
      },
    })

    expect(normalized.autoTranslate.status).toBe("paused")
  })

  test("normalizeProject preserves active running state", () => {
    const project = createProject()

    const normalized = normalizeProject({
      ...project,
      autoTranslate: {
        ...project.autoTranslate,
        status: "running",
        queue: [{ chapterId: "ch-1", paragraphId: "p-0" }],
      },
    })

    expect(normalized.autoTranslate.status).toBe("running")
  })
})
