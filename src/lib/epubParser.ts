import JSZip from "jszip"
import type { Chapter, Paragraph, Project } from "../types/project"
import { getDefaultPreset } from "./presets"

/**
 * Parse an EPUB file into a Project structure.
 * EPUB structure:
 *   book.epub (ZIP)
 *   ├── META-INF/container.xml    → points to content.opf
 *   ├── OEBPS/content.opf         → metadata + spine (chapter order)
 *   └── OEBPS/chapter*.xhtml      → chapter content
 */
export async function parseEpubFile(
  file: File,
  title: string,
  author: string,
  translationPrompt?: string,
): Promise<Project> {
  const zip = await JSZip.loadAsync(file)

  // Find the OPF file path from container.xml
  const opfPath = await findOpfPath(zip)
  const opfContent = await zip.file(opfPath)?.async("string")
  if (!opfContent) {
    throw new Error("Could not read content.opf file")
  }

  // Parse OPF to get metadata, manifest, and spine
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
  const { metadata, manifest, spine } = parseOpf(opfContent)

  // Use extracted metadata if title/author not provided
  const finalTitle = title || metadata.title || "Untitled"
  const finalAuthor = author || metadata.author || "Unknown"

  // Parse chapters in spine order
  const chapters: Chapter[] = []
  let paragraphId = 0

  for (let i = 0; i < spine.length; i++) {
    const itemId = spine[i]!
    const item = manifest.get(itemId)
    if (!item || !item.href) continue

    // Only process XHTML/HTML content
    if (!item.mediaType?.includes("html") && !item.mediaType?.includes("xml")) {
      continue
    }

    const contentPath = opfDir + item.href
    const xhtmlContent = await zip.file(contentPath)?.async("string")
    if (!xhtmlContent) continue

    const { title: chapterTitle, paragraphs } = parseXhtmlContent(xhtmlContent, paragraphId)
    if (paragraphs.length === 0) continue

    paragraphId += paragraphs.length

    chapters.push({
      id: `ch-${i + 1}`,
      title: chapterTitle || `Chapter ${chapters.length + 1}`,
      number: chapters.length + 1,
      paragraphs,
    })
  }

  // Renumber chapters sequentially
  chapters.forEach((ch, idx) => {
    ch.number = idx + 1
  })

  return {
    id: `proj-${Date.now()}`,
    title: finalTitle,
    author: finalAuthor,
    chapters,
    translationPrompt: translationPrompt ?? getDefaultPreset().prompt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Extract just the metadata (title, author) from an EPUB file.
 * Useful for auto-detection without parsing the full book.
 */
export async function extractEpubMetadata(file: File): Promise<{ title: string; author: string }> {
  const zip = await JSZip.loadAsync(file)
  const opfPath = await findOpfPath(zip)
  const opfContent = await zip.file(opfPath)?.async("string")
  if (!opfContent) {
    throw new Error("Could not read content.opf file")
  }

  const { metadata } = parseOpf(opfContent)
  return {
    title: metadata.title || "Unknown",
    author: metadata.author || "Unknown",
  }
}

/**
 * Find the path to the OPF file from container.xml
 */
async function findOpfPath(zip: JSZip): Promise<string> {
  const containerContent = await zip.file("META-INF/container.xml")?.async("string")
  if (!containerContent) {
    throw new Error("Could not find META-INF/container.xml")
  }

  // Parse container.xml to find rootfile path
  const parser = new DOMParser()
  const doc = parser.parseFromString(containerContent, "text/xml")
  const rootfile = doc.querySelector("rootfile")
  const fullPath = rootfile?.getAttribute("full-path")

  if (!fullPath) {
    throw new Error("Could not find OPF path in container.xml")
  }

  return fullPath
}

interface OpfData {
  metadata: { title?: string; author?: string }
  manifest: Map<string, { href: string; mediaType: string }>
  spine: string[]
}

/**
 * Parse the OPF file to extract metadata, manifest, and spine
 */
function parseOpf(opfContent: string): OpfData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(opfContent, "text/xml")

  // Extract metadata
  const titleEl = doc.querySelector("metadata title, dc\\:title")
  const creatorEl = doc.querySelector("metadata creator, dc\\:creator")

  const metadata = {
    title: titleEl?.textContent?.trim(),
    author: creatorEl?.textContent?.trim(),
  }

  // Build manifest map (id -> {href, mediaType})
  const manifest = new Map<string, { href: string; mediaType: string }>()
  const manifestItems = Array.from(doc.querySelectorAll("manifest item"))
  for (const item of manifestItems) {
    const id = item.getAttribute("id")
    const href = item.getAttribute("href")
    const mediaType = item.getAttribute("media-type")
    if (id && href) {
      manifest.set(id, { href, mediaType: mediaType || "" })
    }
  }

  // Get spine order (list of idref values)
  const spine: string[] = []
  const spineItems = Array.from(doc.querySelectorAll("spine itemref"))
  for (const item of spineItems) {
    const idref = item.getAttribute("idref")
    if (idref) {
      spine.push(idref)
    }
  }

  return { metadata, manifest, spine }
}

interface XhtmlResult {
  title: string | null
  paragraphs: Paragraph[]
}

/**
 * Parse XHTML content to extract title and paragraphs
 */
function parseXhtmlContent(xhtml: string, startId: number): XhtmlResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xhtml, "text/html")

  // Try to find chapter title from h1, h2, or title element
  let title: string | null = null
  const h1 = doc.querySelector("h1")
  const h2 = doc.querySelector("h2")
  const titleEl = doc.querySelector("title")

  if (h1?.textContent?.trim()) {
    title = h1.textContent.trim()
  } else if (h2?.textContent?.trim()) {
    title = h2.textContent.trim()
  } else if (titleEl?.textContent?.trim()) {
    title = titleEl.textContent.trim()
  }

  // Extract paragraphs from <p> elements
  const paragraphs: Paragraph[] = []
  const pElements = Array.from(doc.querySelectorAll("p"))

  for (const p of pElements) {
    const text = p.textContent?.trim()
    if (text && text.length > 0) {
      paragraphs.push(createParagraph(startId + paragraphs.length, text))
    }
  }

  return { title, paragraphs }
}

function createParagraph(id: number, text: string): Paragraph {
  return {
    id: `p-${id}`,
    original: text,
    translated: "",
    status: "pending",
    excluded: false,
  }
}
