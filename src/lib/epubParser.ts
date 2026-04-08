import JSZip from "jszip"
import type { Chapter, Paragraph, Project } from "../types/project"
import { createEmptyAutoTranslateState } from "./autoTranslate"
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
  importBatchSize = 250,
): Promise<Project> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

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

    const contentPath = resolveZipPath(opfDir, item.href)
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
    importBatchSize: Math.max(50, Math.floor(importBatchSize)),
    autoTranslate: createEmptyAutoTranslateState(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Extract just the metadata (title, author) from an EPUB file.
 * Useful for auto-detection without parsing the full book.
 */
export async function extractEpubMetadata(file: File): Promise<{ title: string; author: string }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
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

  const fullPath = extractTagAttribute(containerContent, "rootfile", "full-path")

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
  const manifest = new Map<string, { href: string; mediaType: string }>()

  for (const rawItem of matchTags(opfContent, "item")) {
    const id = extractAttribute(rawItem, "id")
    const href = extractAttribute(rawItem, "href")
    const mediaType = extractAttribute(rawItem, "media-type") || ""
    if (id && href) {
      manifest.set(id, { href, mediaType })
    }
  }

  const spine = matchTags(opfContent, "itemref")
    .map((rawItem) => extractAttribute(rawItem, "idref"))
    .filter((idref): idref is string => Boolean(idref))

  return {
    metadata: {
      title: extractFirstText(opfContent, ["dc:title", "title"]) ?? undefined,
      author: extractFirstText(opfContent, ["dc:creator", "creator"]) ?? undefined,
    },
    manifest,
    spine,
  }
}

interface XhtmlResult {
  title: string | null
  paragraphs: Paragraph[]
}

/**
 * Parse XHTML content to extract title and paragraphs
 */
function parseXhtmlContent(xhtml: string, startId: number): XhtmlResult {
  const paragraphs: Paragraph[] = []

  const title = extractFirstText(xhtml, ["h1", "h2", "title"])

  for (const rawParagraph of matchTagContents(xhtml, "p")) {
    const text = cleanupHtmlText(rawParagraph)
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

function resolveZipPath(baseDir: string, href: string): string {
  const segments = `${baseDir}${href}`.split("/")
  const resolved: string[] = []

  for (const segment of segments) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  return resolved.join("/")
}

function extractTagAttribute(content: string, tagName: string, attributeName: string): string | undefined {
  const tagMatch = content.match(new RegExp(`<${tagName}\\b[^>]*>`, "i"))
  if (!tagMatch) return undefined
  return extractAttribute(tagMatch[0], attributeName)
}

function extractAttribute(tag: string, attributeName: string): string | undefined {
  const match = tag.match(new RegExp(`${escapeRegExp(attributeName)}\\s*=\\s*["']([^"']+)["']`, "i"))
  return match?.[1]
}

function matchTags(content: string, tagName: string): string[] {
  return Array.from(content.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi")), (match) => match[0])
}

function matchTagContents(content: string, tagName: string): string[] {
  return Array.from(
    content.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "gi")),
    (match) => match[1] ?? "",
  )
}

function extractFirstText(content: string, tagNames: string[]): string | null {
  for (const tagName of tagNames) {
    const match = content.match(new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(tagName)}>`, "i"))
    const value = match?.[1] ? cleanupHtmlText(match[1]) : ""
    if (value) return value
  }

  return null
}

function cleanupHtmlText(content: string): string {
  return decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
}

function decodeHtmlEntities(content: string): string {
  return content
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
