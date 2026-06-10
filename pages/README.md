# BIO 137 Blackboard Pages

This folder contains the **iframe-ready HTML pages and web-safe assets** that are embedded into
Blackboard for BIO 137 (Summer 2026, Section E0Z9). These are the published, browser-facing files
served by GitHub Pages.

Canonical source documents (LaTeX, PDF, DOCX, source images) live in the repository's `sources/`
folder, **not here**. Treat `sources/` as read-only origin material; treat `pages/` as the
deliverable web output.

## Folder structure

```text
pages/
├── README.md
├── assets/                 # web images (jpg/png) used by the pages below
│   ├── blackboard.jpg
│   ├── connect.jpg
│   ├── mcgraw-hill-logo-png.png
│   ├── Module Overview.png
│   ├── To-Do List.png
│   ├── bottom border.png
│   └── yellow bottom border kctcs.png
├── course-outline/
│   └── course-outline.html
├── syllabus/
│   ├── syllabus.html                          # full visual syllabus
│   └── syllabus-clean-logo-layout-lite.html   # lightweight syllabus w/ logo strip
└── test/
    └── asset-test.html     # diagnostic: confirms images + nested paths load
```

## Conventions

- **No external dependencies.** No CDN scripts, web fonts, trackers, or frameworks — inline CSS only,
  so the pages render reliably inside a Blackboard iframe.
- **Relative image paths.** Pages in `syllabus/`, `course-outline/`, and `test/` reference images as
  `../assets/<file>`. Filenames with spaces use `%20` (e.g. `../assets/Module%20Overview.png`).
- **Local assets only.** Use images from `pages/assets/`; do not hotlink external images.

See the repository root `README.md` for the public GitHub Pages URLs and Blackboard iframe snippets.
