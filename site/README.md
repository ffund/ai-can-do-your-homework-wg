# AI-Aware Assessment Catalogue

This Vite site searches the assessment records in `public/data/assessments/`. It builds focused passages for context, objectives, assessment design, GenAI design, evidence, grading, implementation, and reuse.

## Run locally

Use Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Run the production checks with:

```bash
npm test
npm run build
npm run preview
```

`npm run preview` serves the generated `dist` directory so you can inspect the production build locally.

## Search behavior

The browser uses keyword coverage to select up to 80 candidate records and then selects up to 80 strongest catalogue facets from that shortlist. It sends those public passages to `/api/rerank`, where a Cloudflare Worker runs `@cf/baai/bge-reranker-base`. The browser combines the returned passage scores with keyword coverage to rank records.

Search queries go to the site's Cloudflare Worker. If Workers AI is unavailable, the site reports the fallback and ranks the same records with keyword overlap alone. The browser does not download or run a machine-learning model.

The result view presents the available structured catalogue fields, short source excerpts, and clearly labelled catalogue guidance in instructor-facing sections. Missing facts and sections are omitted, so sparse records remain usable without empty placeholders.

## Deploy to Cloudflare

The Worker serves the Vite build and handles `/api/rerank` on the same origin. Install dependencies, authenticate Wrangler, and deploy:

```bash
npm install
npx wrangler login
npm run deploy
```

`wrangler.jsonc` configures the `AI` binding and serves static files from `dist`. Cloudflare creates a `workers.dev` URL on the first deployment. Add a custom domain in the Worker settings if needed.

Build and run the complete Worker locally with:

```bash
npm run preview:cloudflare
```

Workers AI uses Cloudflare's remote service during local development. Plain `npm run dev` still runs the Vite frontend, but searches use keyword fallback because Vite does not provide `/api/rerank`.

## GitHub Pages

Vite retains a relative base path, so the static build still works on GitHub Pages. Set `VITE_SEARCH_API_URL` to a separately deployed Worker endpoint when building for GitHub Pages. That Worker must also allow the site's origin through CORS; the included configuration uses a same-origin Cloudflare deployment instead.

## Project layout

- `src/main.js` loads records, calls the search API, and renders the interface.
- `src/catalogue-view.js` turns optional catalogue fields into a defensive display model.
- `src/search.js` contains pure facet construction, keyword scoring, cosine normalization, and ranking logic.
- `tests/search.test.js` covers facet construction, keyword matches, hybrid ranking, and the fallback path.
- `worker/index.js` validates search requests and calls the Cloudflare Workers AI reranker.
- `wrangler.jsonc` configures static asset hosting and the Workers AI binding.
- `public/data/assessments/index.json` lists the individual assessment record files loaded by the site.
- `public/data/assessments/*.json` contains one catalogue record per assessment.
- `../assessment-schema.json` defines the JSON Schema Draft 2020-12 record format.
- `../assessment-schema.md` documents required, recommended, and optional fields and the paper-to-assessment relationship model.
- `../normalize-levels.mjs` applies the conservative normalized course and learner-level migration to existing records without changing reported wording.
