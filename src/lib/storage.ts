import type { Project, ProjectSummary } from "../types/project"
import { normalizeProject, normalizeStoredProject } from "./autoTranslate"
import { deleteRecord, getAllRecords, PROJECTS_STORE, putRecords } from "./database"

const PROJECTS_KEY = "bookor_projects"
const CURRENT_PROJECT_KEY = "bookor_current_project"

let projects: Project[] = []
let initializationPromise: Promise<void> | null = null
let pendingProjectWrites = new Map<string, Project | null>()
let isFlushingProjectWrites = false

export function initializeStorage(): Promise<void> {
  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    const indexedProjects = await getAllRecords<Project>(PROJECTS_STORE)
    const projectsById = new Map(indexedProjects.map((project) => [project.id, project]))
    const legacyData = localStorage.getItem(PROJECTS_KEY)

    if (legacyData) {
      const legacyProjects = JSON.parse(legacyData) as Project[]
      const projectsToMigrate: Project[] = []

      for (const legacyProject of legacyProjects) {
        const indexedProject = projectsById.get(legacyProject.id)
        if (!indexedProject || legacyProject.updatedAt > indexedProject.updatedAt) {
          const normalizedProject = normalizeStoredProject(legacyProject)
          projectsById.set(normalizedProject.id, normalizedProject)
          projectsToMigrate.push(normalizedProject)
        }
      }

      await putRecords(PROJECTS_STORE, projectsToMigrate)
      localStorage.removeItem(PROJECTS_KEY)
    }

    projects = [...projectsById.values()].map(normalizeStoredProject)
  })()

  return initializationPromise
}

export function getProjectList(): ProjectSummary[] {
  return projects.map(normalizeStoredProject).map(projectToSummary)
}

export function getProject(id: string): Project | null {
  const project = projects.find(p => p.id === id)
  return project ? normalizeStoredProject(project) : null
}

export function saveProject(project: Project): void {
  const normalizedProject = normalizeProject(project)
  const storedProject = { ...normalizedProject, updatedAt: Date.now() }

  const index = projects.findIndex(p => p.id === normalizedProject.id)
  if (index >= 0) {
    projects[index] = storedProject
  } else {
    projects.push(storedProject)
  }

  pendingProjectWrites.set(normalizedProject.id, storedProject)
  scheduleProjectWrite()
}

export function deleteProject(id: string): void {
  projects = projects.filter(p => p.id !== id)
  pendingProjectWrites.set(id, null)
  scheduleProjectWrite()
}

function scheduleProjectWrite(): void {
  if (isFlushingProjectWrites) return
  isFlushingProjectWrites = true

  queueMicrotask(async () => {
    try {
      while (pendingProjectWrites.size > 0) {
        const writes = pendingProjectWrites
        pendingProjectWrites = new Map()

        for (const [id, project] of writes) {
          if (project) {
            await putRecords(PROJECTS_STORE, [project])
          } else {
            await deleteRecord(PROJECTS_STORE, id)
          }
        }
      }
    } catch (error) {
      console.error("Failed to persist project:", error)
    } finally {
      isFlushingProjectWrites = false
      if (pendingProjectWrites.size > 0) scheduleProjectWrite()
    }
  })
}

export function getCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_PROJECT_KEY)
}

export function setCurrentProjectId(id: string | null): void {
  if (id) {
    localStorage.setItem(CURRENT_PROJECT_KEY, id)
  } else {
    localStorage.removeItem(CURRENT_PROJECT_KEY)
  }
}

function projectToSummary(project: Project): ProjectSummary {
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

  return {
    id: project.id,
    title: project.title,
    author: project.author,
    progress: { translated, reviewed, total },
    updatedAt: project.updatedAt,
  }
}
