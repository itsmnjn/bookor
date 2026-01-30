import { useCallback, useEffect, useState } from "react"
import { Editor } from "./components/Editor"
import { ImportModal } from "./components/ImportModal"
import { ProjectList } from "./components/ProjectList"
import { SettingsPanel } from "./components/SettingsPanel"
import { initGemini } from "./lib/gemini"
import { parseBookFile } from "./lib/parser"
import { deleteProject, getCurrentProjectId, getProject, getProjectList, saveProject, setCurrentProjectId } from "./lib/storage"
import type { Project, ProjectSummary, TranslationPreset } from "./types/project"
import "./index.css"

type View = "list" | "editor"

export function App() {
  const [view, setView] = useState<View>("list")
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Load projects on mount
  useEffect(() => {
    setProjects(getProjectList())

    // Initialize Gemini if key is saved
    const savedKey = localStorage.getItem("bookor_gemini_key")
    if (savedKey) {
      initGemini(savedKey)
    }

    // Restore last project if any
    const lastProjectId = getCurrentProjectId()
    if (lastProjectId) {
      const project = getProject(lastProjectId)
      if (project) {
        setCurrentProject(project)
        setView("editor")
      }
    }
  }, [])

  const handleSelectProject = useCallback((id: string) => {
    const project = getProject(id)
    if (project) {
      setCurrentProject(project)
      setCurrentProjectId(id)
      setView("editor")
    }
  }, [])

  const handleDeleteProject = useCallback((id: string) => {
    deleteProject(id)
    setProjects(getProjectList())
  }, [])

  const handleBackToList = useCallback(() => {
    setView("list")
    setCurrentProject(null)
    setCurrentProjectId(null)
    setProjects(getProjectList())
  }, [])

  const handleImport = useCallback(async (file: File, title: string, author: string, preset: TranslationPreset) => {
    try {
      const project = await parseBookFile(file, title, author, preset.prompt)
      saveProject(project)
      setProjects(getProjectList())
      setShowImportModal(false)

      // Open the new project
      setCurrentProject(project)
      setCurrentProjectId(project.id)
      setView("editor")
    } catch (error) {
      console.error("Failed to import book:", error)
    }
  }, [])

  const handleUpdateProject = useCallback((project: Project) => {
    saveProject(project)
    setCurrentProject(project)
  }, [])

  const handleUpdatePrompt = useCallback((prompt: string) => {
    if (currentProject) {
      const updated = { ...currentProject, translationPrompt: prompt }
      saveProject(updated)
      setCurrentProject(updated)
    }
  }, [currentProject])

  return (
    <>
      {view === "list" && (
        <ProjectList
          projects={projects}
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onNewProject={() => setShowImportModal(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {view === "editor" && currentProject && (
        <Editor
          project={currentProject}
          onBack={handleBackToList}
          onOpenSettings={() => setShowSettings(true)}
          onUpdateProject={handleUpdateProject}
        />
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      {showSettings && (
        <SettingsPanel
          translationPrompt={currentProject?.translationPrompt}
          onUpdatePrompt={currentProject ? handleUpdatePrompt : undefined}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}

export default App
