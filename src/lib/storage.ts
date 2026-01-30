import type { Project, ProjectSummary } from "../types/project"

const PROJECTS_KEY = "bookor_projects"
const CURRENT_PROJECT_KEY = "bookor_current_project"

export function getProjectList(): ProjectSummary[] {
  const data = localStorage.getItem(PROJECTS_KEY)
  if (!data) return []

  const projects: Project[] = JSON.parse(data)
  return projects.map(projectToSummary)
}

export function getProject(id: string): Project | null {
  const data = localStorage.getItem(PROJECTS_KEY)
  if (!data) return null

  const projects: Project[] = JSON.parse(data)
  return projects.find(p => p.id === id) || null
}

export function saveProject(project: Project): void {
  const data = localStorage.getItem(PROJECTS_KEY)
  const projects: Project[] = data ? JSON.parse(data) : []

  const index = projects.findIndex(p => p.id === project.id)
  if (index >= 0) {
    projects[index] = { ...project, updatedAt: Date.now() }
  } else {
    projects.push({ ...project, updatedAt: Date.now() })
  }

  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

export function deleteProject(id: string): void {
  const data = localStorage.getItem(PROJECTS_KEY)
  if (!data) return

  const projects: Project[] = JSON.parse(data)
  const filtered = projects.filter(p => p.id !== id)
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered))
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
      if (para.excluded) continue  // Skip excluded paragraphs
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
