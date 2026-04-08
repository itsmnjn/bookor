import JSZip from "jszip"
import { basename } from "node:path"
import { parseBookFile } from "../src/lib/parser"

interface OpfDiagnostics {
  opfPath: string
  spineItemCount: number
  htmlSpineItems: Array<{
    id: string
    href: string
    mediaType: string
    resolvedPath: string
    existsInZip: boolean
  }>
}

const DEFAULT_BATCH_SIZE = 250

async function main() {
  const epubPath = process.argv[2]
  const batchSizeArg = process.argv[3]

  if (!epubPath) {
    console.error("Usage: bun scripts/inspect-import.ts <epub-path> [batch-size]")
    process.exit(1)
  }

  const batchSize = normalizeBatchSize(Number(batchSizeArg || DEFAULT_BATCH_SIZE))
  const source = Bun.file(epubPath)

  if (!(await source.exists())) {
    console.error(`File not found: ${epubPath}`)
    process.exit(1)
  }

  const bytes = await source.arrayBuffer()
  const file = new File([bytes], basename(epubPath), { type: "application/epub+zip" })
  const diagnostics = await inspectOpf(bytes)
  const project = await parseBookFile(file, "", "", undefined, batchSize)

  console.log(JSON.stringify({
    file: epubPath,
    batchSize,
    opf: {
      path: diagnostics.opfPath,
      spineItemCount: diagnostics.spineItemCount,
      htmlSpineItemCount: diagnostics.htmlSpineItems.length,
      missingHtmlSpineItems: diagnostics.htmlSpineItems.filter((item) => !item.existsInZip),
      htmlSpineItems: diagnostics.htmlSpineItems,
    },
    parsed: {
      title: project.title,
      author: project.author,
      chapterCount: project.chapters.length,
      totalParagraphs: project.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0),
      chapters: project.chapters.map((chapter) => ({
        number: chapter.number,
        id: chapter.id,
        title: chapter.title,
        paragraphCount: chapter.paragraphs.length,
        sample: chapter.paragraphs[0]?.original.slice(0, 120) ?? null,
      })),
    },
  }, null, 2))
}

async function inspectOpf(bytes: ArrayBuffer): Promise<OpfDiagnostics> {
  const zip = await JSZip.loadAsync(bytes)
  const opfPath = await findOpfPath(zip)
  const opfContent = await zip.file(opfPath)?.async("string")

  if (!opfContent) {
    throw new Error(`Could not read OPF at ${opfPath}`)
  }

  const opfDir = opfPath.slice(0, opfPath.lastIndexOf("/") + 1)

  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const item of matchTags(opfContent, "item")) {
    const id = extractAttribute(item, "id")
    const href = extractAttribute(item, "href")
    const mediaType = extractAttribute(item, "media-type") || ""
    if (id && href) {
      manifest.set(id, { href, mediaType })
    }
  }

  const spineIds = matchTags(opfContent, "itemref")
    .map((item) => extractAttribute(item, "idref"))
    .filter((value): value is string => Boolean(value))

  const htmlSpineItems = spineIds
    .map((id) => {
      const manifestItem = manifest.get(id)
      if (!manifestItem) return null
      if (!manifestItem.mediaType.includes("html") && !manifestItem.mediaType.includes("xml")) {
        return null
      }

      const resolvedPath = resolveZipPath(opfDir, manifestItem.href)
      return {
        id,
        href: manifestItem.href,
        mediaType: manifestItem.mediaType,
        resolvedPath,
        existsInZip: Boolean(zip.file(resolvedPath)),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return {
    opfPath,
    spineItemCount: spineIds.length,
    htmlSpineItems,
  }
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeBatchSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE
  return Math.min(5000, Math.max(50, Math.floor(value)))
}

await main()
