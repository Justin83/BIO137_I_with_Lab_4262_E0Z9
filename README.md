# BIO 137 — Human Anatomy & Physiology I (Summer 2026, Section E0Z9)

Blackboard iframe-ready HTML pages and supporting assets for **one** course section:
BIO 137 Human Anatomy & Physiology I with Lab, Summer 2026, Section E0Z9 / Class 2787 (SMC 4262),
June 15 – August 7. Instructor: Justin N. Howard.

This is **not** a general public website. Its only job is to serve clean, self-contained HTML
pages that get embedded into Blackboard via `<iframe>`.

## Public GitHub Pages URL

> https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/

Pages is published from the **`main`** branch, **root (`/`)** folder. Nested paths
(e.g. `pages/syllabus/...`) and assets serve correctly.

## Active pages

| Page | Served URL |
|------|------------|
| Landing page | https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/ |
| Visual syllabus | https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/syllabus/syllabus.html |
| Syllabus (logo layout) | https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/syllabus/syllabus-clean-logo-layout-lite.html |
| Course outline | https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/course-outline/course-outline.html |
| Asset / path test | https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/test/asset-test.html |

## Blackboard iframe snippets

**Course landing page**

```html
<iframe
  src="https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/"
  width="100%"
  height="4200"
  style="border:0;width:100%;min-height:4200px;background:#ffffff;"
  title="BIO 137 Course Page">
</iframe>
```

**Logo-layout syllabus**

```html
<iframe
  src="https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/syllabus/syllabus-clean-logo-layout-lite.html"
  width="100%"
  height="4200"
  style="border:0;width:100%;min-height:4200px;background:#ffffff;"
  title="BIO 137 Clean Logo Layout Syllabus">
</iframe>
```

**Course outline**

```html
<iframe
  src="https://justin83.github.io/BIO137_I_with_Lab_4262_E0Z9/pages/course-outline/course-outline.html"
  width="100%"
  height="4200"
  style="border:0;width:100%;min-height:4200px;background:#ffffff;"
  title="BIO 137 Course Outline">
</iframe>
```

> Always iframe the **`justin83.github.io`** URL — never `raw.githubusercontent.com` (it is
> not served as HTML and will not render in an iframe).

## Repository layout

```text
/
├── index.html                 # GitHub Pages landing page (links to all pages)
├── README.md                  # this file
├── .nojekyll                  # serve files as-is, skip Jekyll processing
├── pages/                     # iframe-ready HTML + web-safe assets
│   ├── README.md
│   ├── assets/                # web images used by the pages (jpg/png)
│   ├── course-outline/
│   ├── syllabus/
│   └── test/                  # asset/path diagnostic page
└── sources/                   # canonical source materials — DO NOT edit casually
```

## ⚠️ `sources/` is canonical source material

`sources/` holds the original LaTeX project, the Cannon/SCC source documents
(PDF, DOCX, TXT), and source images that the published pages were derived from.
**Do not edit, overwrite, or delete files in `sources/` without backing them up first.**
Published web pages and their web-safe images live under `pages/`, not `sources/`.

## Asset path rules

- Files in `pages/syllabus/` and `pages/course-outline/` reference images as `../assets/<file>`.
- Files in `pages/test/` reference images as `../assets/<file>`.
- The root `index.html` references images as `pages/assets/<file>`.
- Asset filenames that contain spaces use `%20` in URLs, e.g. `../assets/Module%20Overview.png`.
