# UnArtifact

**Client-Side AI Document Sanitizer & Artifact Remover**

UnArtifact strips AI formatting artifacts, hidden metadata, revision marks, and LLM boilerplate from `.doc` and `.docx` files — **entirely inside your browser**. No uploads, no telemetry, no backend.

---

## Features

- 🔒 **100% offline-first** — all parsing runs in client memory (JSZip + DOMParser).
- 🧹 **AI artifact cleanup** — resets gray shading (`#F3F4F6`, `#E5E7EB`), removes inline `Consolas`/`Courier New`/`Monaco` overrides, normalizes irregular indents.
- 🕵️ **Metadata scrub** — deletes `docProps/core.xml`, `docProps/app.xml`, author/initials, revision history (`w:ins`, `w:del`), and comment streams.
- ✂️ **LLM boilerplate removal** — regex-scrubs "Here is the revised document:", "Certainly! Here is…", "In conclusion…", "I hope this helps!", etc.
- 📄 **Extension preserved** — `.docx` → `.docx`, `.doc` → `.doc`. The output filename is always `<original>_unartifact.<ext>`.

---

## Local Execution

### 1. Install dev tooling (Tailwind build)

```bash
npm install
```

### 2. Build the CSS

```bash
npm run build:css
```

Then update `index.html` to link the compiled stylesheet:

```html
<link rel="stylesheet" href="/assets/css/build.css" />
```

(For a quick throwaway demo you can instead use the Tailwind Play CDN, but do **not** ship that to production — it violates the strict CSP in `_headers`.)

### 3. Serve locally

```bash
npm run dev
# → http://localhost:5173
```

Any static file server works (`python -m http.server`, `npx serve`, VS Code Live Server, etc.). There is no build step required for the JS — it is plain ES2020 and runs natively in the browser.

---

## Deployment — Cloudflare Pages

1. Push this repository to GitHub/GitLab.
2. In the Cloudflare dashboard: **Pages → Create a project → Connect to Git**.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `/` (root — this is a static site with `index.html` at the top level)
4. `public/_headers` and `public/_routes.json` are automatically honored by Cloudflare Pages when placed at the **project root** as `_headers` and `_routes.json`. If your Pages project uses a `public/` output dir, move them there; otherwise copy them to the repo root.
5. Deploy. The CSP in `_headers` enforces `connect-src 'none'`, so any accidental fetch from the app is blocked by the browser — a hard guarantee of the privacy promise.

### Manual drag-and-drop deploy

```bash
npx wrangler pages deploy . --project-name unartifact
```

---

## Architecture Notes

- **No backend, ever.** The app is a static bundle: one HTML file, three JS modules, one compiled CSS file, two vendored libraries.
- **`.docx` path:** JSZip unwraps the OOXML container → `DOMParser` edits `word/document.xml` as a real XML tree (never regex on XML) → `XMLSerializer` re-emits → JSZip re-packs. Metadata parts are deleted from the zip manifest outright.
- **`.doc` path:** Legacy compound-binary format. Full-fidelity editing would require a heavy parser; UnArtifact performs a conservative byte-level scrub of ASCII and UTF-16LE boilerplate strings and author markers, leaving the rest of the binary untouched. Extension preserved.
- **Extension safety:** output filename is computed as `base + '_unartifact.' + ext`, where `ext` is the original lowercased extension. A `.doc` input can never produce a `.docx` output.

---

## License

MIT. Provided as-is; always keep a backup of your original documents.