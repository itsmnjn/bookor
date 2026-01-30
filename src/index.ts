import { serve } from "bun"
import index from "./index.html"

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/fetch-gutenberg": {
      async GET(req) {
        const url = new URL(req.url)
        const gutenbergUrl = url.searchParams.get("url")

        if (!gutenbergUrl) {
          return Response.json({ error: "Missing url parameter" }, { status: 400 })
        }

        // Validate URL is from gutenberg.org
        try {
          const parsed = new URL(gutenbergUrl)
          if (!parsed.hostname.endsWith("gutenberg.org")) {
            return Response.json(
              { error: "URL must be from gutenberg.org" },
              { status: 400 }
            )
          }
        } catch {
          return Response.json({ error: "Invalid URL" }, { status: 400 })
        }

        // Fetch the text content
        try {
          const response = await fetch(gutenbergUrl)
          if (!response.ok) {
            return Response.json(
              { error: `Failed to fetch: ${response.status} ${response.statusText}` },
              { status: 502 }
            )
          }

          const text = await response.text()
          return Response.json({ text })
        } catch (err) {
          return Response.json(
            { error: `Fetch error: ${err instanceof Error ? err.message : "Unknown error"}` },
            { status: 502 }
          )
        }
      },
    },

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        })
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        })
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name
      return Response.json({
        message: `Hello, ${name}!`,
      })
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
})

console.log(`🚀 Server running at ${server.url}`)
