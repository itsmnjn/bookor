import { describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { parseEpubFile } from "./epubParser"

describe("parseEpubFile", () => {
  test("extracts paragraphs from standard p-based chapters", async () => {
    const file = await buildEpubFile({
      title: "Test Book",
      author: "Author",
      chapters: [
        {
          fileName: "chapter1.xhtml",
          body: `
            <h1>Chapter One</h1>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
          `,
        },
      ],
    })

    const project = await parseEpubFile(file, "", "")

    expect(project.title).toBe("Test Book")
    expect(project.author).toBe("Author")
    expect(project.chapters).toHaveLength(1)
    expect(project.chapters[0]?.title).toBe("Chapter One")
    expect(project.chapters[0]?.paragraphs.map((paragraph) => paragraph.original)).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ])
  })

  test("extracts readable lines from div plus br chapters", async () => {
    const file = await buildEpubFile({
      title: "Fallback Book",
      author: "Unknown",
      chapters: [
        {
          fileName: "chapter1.xhtml",
          body: `
            <div>
              <span style="display:block">Chapter Two</span><br/>
              <br/>
              First line.<br/>
              Second line.<br/>
              <br/>
              Third line.
            </div>
          `,
        },
      ],
    })

    const project = await parseEpubFile(file, "", "")

    expect(project.chapters).toHaveLength(1)
    expect(project.chapters[0]?.title).toBe("Chapter Two")
    expect(project.chapters[0]?.paragraphs.map((paragraph) => paragraph.original)).toEqual([
      "First line.",
      "Second line.",
      "Third line.",
    ])
  })
})

async function buildEpubFile({
  title,
  author,
  chapters,
}: {
  title: string
  author: string
  chapters: Array<{ fileName: string; body: string }>
}): Promise<File> {
  const zip = new JSZip()

  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`)

  const manifestItems = chapters
    .map((chapter, index) => `<item id="chapter-${index}" href="Text/${chapter.fileName}" media-type="application/xhtml+xml"/>`)
    .join("")
  const spineItems = chapters
    .map((_, index) => `<itemref idref="chapter-${index}"/>`)
    .join("")

  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="utf-8"?>
    <package version="2.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>${title}</dc:title>
        <dc:creator>${author}</dc:creator>
      </metadata>
      <manifest>${manifestItems}</manifest>
      <spine>${spineItems}</spine>
    </package>`)

  for (const chapter of chapters) {
    zip.file("OEBPS/Text/" + chapter.fileName, `<?xml version="1.0" encoding="utf-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>${chapter.body}</body>
      </html>`)
  }

  const bytes = await zip.generateAsync({ type: "uint8array" })
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new File([arrayBuffer], "test.epub", { type: "application/epub+zip" })
}
