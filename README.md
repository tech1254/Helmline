# Helmline

Hello World page served by the `helmline` Cloudflare Worker.

- `public/` holds the static files the Worker serves.
- `wrangler.jsonc` configures the Worker.
- Pushes to `main` deploy through Cloudflare Workers Builds (`npx wrangler deploy`).

Local preview: `npm install && npm run dev`
