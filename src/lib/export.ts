import type { Project } from "../types/project"

/**
 * Generate markdown content from reviewed paragraphs only
 */
export function generateMarkdown(project: Project): string {
  const lines: string[] = []

  // Title and author
  lines.push(`# ${project.title}`)
  if (project.author) {
    lines.push(`*${project.author}*`)
  }
  lines.push("")

  // Chapters
  for (const chapter of project.chapters) {
    // Chapter header - use title directly as it may already contain chapter designation
    lines.push(`## ${chapter.title}`)
    lines.push("")

    // Only include reviewed, non-excluded paragraphs
    const reviewedParagraphs = chapter.paragraphs.filter(
      (p) => p.status === "reviewed" && !p.excluded
    )

    for (const paragraph of reviewedParagraphs) {
      lines.push(paragraph.translated)
      lines.push("")
    }
  }

  return lines.join("\n").trim()
}

/**
 * Generate and trigger download of markdown file
 */
export function downloadMarkdown(project: Project): void {
  const markdown = generateMarkdown(project)
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `${project.title}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}
