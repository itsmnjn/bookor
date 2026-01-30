import type { ProjectSummary } from "../types/project"
import { PlusIcon } from "./Icons"
import { ProgressBar } from "./ProgressBar"

interface ProjectListProps {
  projects: ProjectSummary[]
  onSelectProject: (id: string) => void
  onNewProject: () => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })
}

export function ProjectList({ projects, onSelectProject, onNewProject }: ProjectListProps) {
  return (
    <div className="project-list">
      <header className="project-list__header">
        <div>
          <h1 className="project-list__title">bookor</h1>
          <p className="project-list__subtitle">Book translation workspace</p>
        </div>
        <button className="btn btn--primary" onClick={onNewProject}>
          <PlusIcon className="icon" />
          New Project
        </button>
      </header>

      {projects.length === 0
        ? (
          <div className="project-list__empty">
            <h2 className="project-list__empty-title">No projects yet</h2>
            <p>Import a book to start translating</p>
          </div>
        )
        : (
          <div className="project-list__grid">
            {projects.map((project) => (
              <article
                key={project.id}
                className="project-card"
                onClick={() => onSelectProject(project.id)}
              >
                <div className="project-card__header">
                  <div>
                    <h2 className="project-card__title">{project.title}</h2>
                    <p className="project-card__author">{project.author}</p>
                  </div>
                  <span className="project-card__meta">
                    {formatDate(project.updatedAt)}
                  </span>
                </div>
                <div className="project-card__footer">
                  <div className="project-card__progress">
                    <ProgressBar
                      translated={project.progress.translated}
                      reviewed={project.progress.reviewed}
                      total={project.progress.total}
                    />
                  </div>
                  <span className="project-card__stats">
                    {project.progress.reviewed}/{project.progress.total} reviewed
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>
  )
}
