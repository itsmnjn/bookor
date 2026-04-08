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

interface MarkupElementNode {
  type: "element"
  name: string
  attributes: Record<string, string>
  children: MarkupNode[]
}

interface MarkupTextNode {
  type: "text"
  text: string
}

type MarkupNode = MarkupElementNode | MarkupTextNode

/**
 * Parse the OPF file to extract metadata, manifest, and spine
 */
function parseOpf(opfContent: string): OpfData {
  const root = parseMarkup(opfContent)
  const manifest = new Map<string, { href: string; mediaType: string }>()

  for (const item of findAllElements(root, (node) => node.name === "item")) {
    const id = item.attributes.id
    const href = item.attributes.href
    const mediaType = item.attributes["media-type"] || ""
    if (id && href) {
      manifest.set(id, { href, mediaType })
    }
  }

  const spine = findAllElements(root, (node) => node.name === "itemref")
    .map((item) => item.attributes.idref)
    .filter((idref): idref is string => Boolean(idref))

  return {
    metadata: {
      title: findFirstElementText(root, ["dc:title", "title"]) ?? undefined,
      author: findFirstElementText(root, ["dc:creator", "creator"]) ?? undefined,
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
  const root = parseMarkup(xhtml)
  const body = findFirstElement(root, (node) => node.name === "body") ?? root
  let title = findFirstElementText(body, ["h1", "h2", "h3"]) ?? findFirstElementText(root, ["title"])
  const blocks = extractReadableBlocks(body)

  if (!title && blocks[0]) {
    title = blocks[0]
  }

  const contentBlocks = title && blocks[0] === title ? blocks.slice(1) : blocks
  return {
    title,
    paragraphs: contentBlocks.map((text, index) => createParagraph(startId + index, text)),
  }
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
  const root = parseMarkup(content)
  const element = findFirstElement(root, (node) => node.name === tagName.toLowerCase())
  return element?.attributes[attributeName.toLowerCase()]
}

function parseMarkup(content: string): MarkupElementNode {
  const root: MarkupElementNode = { type: "element", name: "__root__", attributes: {}, children: [] }
  const stack: MarkupElementNode[] = [root]
  const tokens = content.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) ?? []

  for (const token of tokens) {
    if (!token) continue

    if (token.startsWith("<!--") || token.startsWith("<?") || /^<!DOCTYPE/i.test(token)) {
      continue
    }

    if (token.startsWith("<![CDATA[")) {
      stack[stack.length - 1]!.children.push({
        type: "text",
        text: token.slice(9, -3),
      })
      continue
    }

    if (token.startsWith("</")) {
      const closeName = token.slice(2, -1).trim().toLowerCase()
      while (stack.length > 1) {
        const current = stack.pop()!
        if (current.name === closeName) break
      }
      continue
    }

    if (token.startsWith("<")) {
      const selfClosing = token.endsWith("/>")
      const inner = token.slice(1, token.length - (selfClosing ? 2 : 1)).trim()
      const nameMatch = inner.match(/^([^\s/>]+)/)
      if (!nameMatch) continue

      const name = nameMatch[1]!.toLowerCase()
      const attributes = parseAttributes(inner.slice(nameMatch[0].length))
      const node: MarkupElementNode = { type: "element", name, attributes, children: [] }
      stack[stack.length - 1]!.children.push(node)

      if (!selfClosing && !VOID_ELEMENT_NAMES.has(name)) {
        stack.push(node)
      }
      continue
    }

    stack[stack.length - 1]!.children.push({ type: "text", text: token })
  }

  return root
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

  for (const match of source.matchAll(pattern)) {
    const name = match[1]?.toLowerCase()
    if (!name) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    attributes[name] = value
  }

  return attributes
}

function findFirstElement(node: MarkupElementNode, predicate: (node: MarkupElementNode) => boolean): MarkupElementNode | null {
  for (const child of node.children) {
    if (child.type !== "element") continue
    if (predicate(child)) return child

    const nested = findFirstElement(child, predicate)
    if (nested) return nested
  }

  return null
}

function findAllElements(node: MarkupElementNode, predicate: (node: MarkupElementNode) => boolean): MarkupElementNode[] {
  const matches: MarkupElementNode[] = []

  for (const child of node.children) {
    if (child.type !== "element") continue
    if (predicate(child)) {
      matches.push(child)
    }
    matches.push(...findAllElements(child, predicate))
  }

  return matches
}

function findFirstElementText(node: MarkupElementNode, tagNames: string[]): string | null {
  const nameSet = new Set(tagNames.map((name) => name.toLowerCase()))
  const element = findFirstElement(node, (candidate) => nameSet.has(candidate.name))
  if (!element) return null

  const value = normalizeExtractedText(renderText(element))
  return value || null
}

function extractReadableBlocks(node: MarkupElementNode): string[] {
  const blocks: string[] = []

  for (const child of node.children) {
    if (child.type === "element") {
      collectReadableBlocks(child, blocks)
    }
  }

  return blocks
}

function collectReadableBlocks(node: MarkupElementNode, blocks: string[]): void {
  if (SKIP_ELEMENT_NAMES.has(node.name)) return

  if (HEADING_ELEMENT_NAMES.has(node.name)) {
    return
  }

  if (LEAF_BLOCK_ELEMENT_NAMES.has(node.name)) {
    blocks.push(...splitRenderedBlock(renderText(node), node.name))
    return
  }

  if (CONTAINER_BLOCK_ELEMENT_NAMES.has(node.name) && !hasDirectStructuredChildren(node)) {
    blocks.push(...splitRenderedBlock(renderText(node), node.name))
    return
  }

  for (const child of node.children) {
    if (child.type === "element") {
      collectReadableBlocks(child, blocks)
    }
  }
}

function hasDirectStructuredChildren(node: MarkupElementNode): boolean {
  return node.children.some((child) => {
    if (child.type !== "element") return false
    if (!LEAF_BLOCK_ELEMENT_NAMES.has(child.name)
      && !CONTAINER_BLOCK_ELEMENT_NAMES.has(child.name)
      && !HEADING_ELEMENT_NAMES.has(child.name)) {
      return false
    }

    return normalizeExtractedText(renderText(child)).length > 0
  })
}

function renderText(node: MarkupElementNode | MarkupTextNode): string {
  if (node.type === "text") {
    return node.text
  }

  if (SKIP_ELEMENT_NAMES.has(node.name)) return ""
  if (LINE_BREAK_ELEMENT_NAMES.has(node.name)) return "\n"

  let result = ""
  for (const child of node.children) {
    result += renderText(child)
    if (child.type === "element" && BLOCK_BOUNDARY_ELEMENT_NAMES.has(child.name)) {
      result += "\n"
    }
  }

  return result
}

function splitRenderedBlock(text: string, tagName: string): string[] {
  const normalized = normalizeExtractedText(text)
  if (!normalized) return []

  const paragraphChunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)

  if (paragraphChunks.length > 1) {
    return paragraphChunks
  }

  if (CONTAINER_BLOCK_ELEMENT_NAMES.has(tagName)) {
    return normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  return [normalized]
}

function normalizeExtractedText(content: string): string {
  return decodeHtmlEntities(content)
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
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

const VOID_ELEMENT_NAMES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source"])
const SKIP_ELEMENT_NAMES = new Set(["head", "script", "style", "meta", "link", "img", "svg", "noscript"])
const LINE_BREAK_ELEMENT_NAMES = new Set(["br", "hr"])
const HEADING_ELEMENT_NAMES = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const LEAF_BLOCK_ELEMENT_NAMES = new Set(["p", "blockquote", "li", "pre"])
const CONTAINER_BLOCK_ELEMENT_NAMES = new Set(["body", "div", "section", "article", "td"])
const BLOCK_BOUNDARY_ELEMENT_NAMES = new Set([
  ...LEAF_BLOCK_ELEMENT_NAMES,
  ...CONTAINER_BLOCK_ELEMENT_NAMES,
  ...HEADING_ELEMENT_NAMES,
  "tr",
])
