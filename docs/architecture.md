unartifact/
├── index.html                  # Single-page shell: navbar, footer, all 5 view sections
├── assets/
│   ├── css/
│   │   └── styles.css          # Tailwind directives + custom component styles
│   └── js/
│       ├── app.js              # SPA router, view switcher, form validation, UI state
│       ├── cleaner.js          # Core cleaning engine (JSZip + DOMParser + regex scrub)
│       └── vendor/
│           ├── jszip.min.js    # JSZip 3.10.1 (in-browser zip read/write)
│           └── file-saver.js   # FileSaver.js for triggering client-side downloads
├── public/
│   ├── _headers                # Cloudflare Pages security & cache headers
│   ├── _routes.json            # Cloudflare Pages SPA fallback routing
│   ├── robots.txt              # Search engine directives
│   └── favicon.svg             # UnArtifact shield/eraser glyph
├── tailwind.config.js          # Tailwind build config (content paths, brand tokens)
├── postcss.config.js           # PostCSS pipeline for Tailwind
├── package.json                # Dev/build scripts (Tailwind CLI, local server)
└── README.md                   # Local execution + Cloudflare Pages deploy guide