import { jsPDF } from "jspdf"
import type { Project } from "../types/project"

// Cache for the font data (base64)
let cachedFontBase64: string | null = null

/**
 * Load and register Korean font with jsPDF
 */
async function loadKoreanFont(doc: jsPDF): Promise<void> {
  if (!cachedFontBase64) {
    // Fetch Noto Sans KR Regular from Google Fonts
    const fontUrl = "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf"

    const response = await fetch(fontUrl)
    const arrayBuffer = await response.arrayBuffer()

    // Convert to base64
    cachedFontBase64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    )
  }

  // Register font with this jsPDF instance
  doc.addFileToVFS("NotoSansKR-Regular.ttf", cachedFontBase64)
  doc.addFont("NotoSansKR-Regular.ttf", "NotoSansKR", "normal")
  doc.setFont("NotoSansKR", "normal")
}

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
    lines.push(`## ${chapter.title}`)
    lines.push("")

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

/**
 * Generate and trigger download of PDF file
 */
export async function downloadPdf(project: Project): Promise<void> {
  try {
    const doc = new jsPDF()

    await loadKoreanFont(doc)

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 25
    const maxWidth = pageWidth - margin * 2
    const lineHeight = 7
    let y = margin

    const addPageIfNeeded = (height: number): boolean => {
      if (y + height > pageHeight - margin) {
        doc.addPage()
        doc.setFont("NotoSansKR", "normal")
        y = margin
        return true
      }
      return false
    }

    // Title
    doc.setFontSize(22)
    const titleLines = doc.splitTextToSize(project.title, maxWidth)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 9 + 4

    // Author
    if (project.author) {
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      doc.text(project.author, margin, y)
      doc.setTextColor(0, 0, 0)
      y += 8
    }

    y += 15

    // Chapters
    for (const chapter of project.chapters) {
      // Chapter header
      doc.setFontSize(14)
      const chapterLines = doc.splitTextToSize(chapter.title, maxWidth)
      addPageIfNeeded(chapterLines.length * 7 + 12)
      doc.text(chapterLines, margin, y)
      y += chapterLines.length * 7 + 8

      const reviewedParagraphs = chapter.paragraphs.filter(
        (p) => p.status === "reviewed" && !p.excluded
      )

      // Paragraphs
      doc.setFontSize(11)
      for (const paragraph of reviewedParagraphs) {
        // Split by newlines first to preserve paragraph breaks within the translation
        const textBlocks = paragraph.translated.split(/\n+/)

        for (const block of textBlocks) {
          if (!block.trim()) continue

          const lines = doc.splitTextToSize(block.trim(), maxWidth)
          const blockHeight = lines.length * lineHeight

          // Check if we need a new page
          if (y + blockHeight > pageHeight - margin) {
            doc.addPage()
            doc.setFont("NotoSansKR", "normal")
            doc.setFontSize(11)
            y = margin
          }

          doc.text(lines, margin, y)
          y += blockHeight + 3
        }

        // Space between paragraphs
        y += 5
      }

      // Space between chapters
      y += 12
    }

    doc.save(`${project.title}.pdf`)
  } catch (error) {
    console.error("PDF generation failed:", error)
    alert("PDF generation failed: " + (error as Error).message)
  }
}
