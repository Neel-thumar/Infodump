# infodump — a local Markdown course library

**Chapter reader update:** the 16 supplied volumes now live in folders containing **158 chapter/section files**, with lossless original backups. Read one chapter at a time, use **← / →** navigation, and customize text size, width, and panel visibility in **Aa/settings**. See [CHAPTERS.md](CHAPTERS.md) for the current physical layout, migration/audit commands, new controls, and progress compatibility. Standalone Markdown volumes described below remain supported; the original content-tree listing is the pre-split layout.

A complete Next.js App Router application. No database, accounts, authentication, content registry, or build-time content generation. All three levels are discovered from disk on each request. The application binds to **127.0.0.1**, not the LAN.

## Quick start

Prerequisites: Node.js **20.9 or later** and npm. Tested here with Node 24.13.0. The lockfile records the installed versions.

From this project root:

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. On Windows PowerShell 5.1 use separate commands, not `&&`. On a shell supporting `&&`, `npm install && npm run dev` is equivalent.

The supplied originals were copied into [content](content/) and subsequently split into verified chapter folders, with full-volume backups in hidden archives. The one-time import command is `npm run seed`; it never overwrites an existing destination and skips already-split volumes. The application does **not** consult this importer at runtime. The original [course](course/) directory is archival input, not a second live content source.

**Corpus discrepancy:** the actual workspace supplied 16 Markdown files: 10 Debian volumes and 6 tree volumes. The specified unnumbered B-tree guide was not present. It was not invented. An unnumbered guide fixture exercises its title, URL, and last-place ordering in tests. Drop your real guide into the trees course when available.

Production, still dynamically scanned:

```powershell
npm run build
npm start
```

Building does not package the course contents. Keep the content directory beside the project when deploying or set `CONTENT_ROOT` to its location. There are no external fonts or CDN dependencies for rendering; KaTeX fonts ship with the app.

## Content layout and adding courses

The root is **content**, a sibling of [src](src/) and [package.json](package.json), not inside the source tree or public web root. This supersedes the earlier two-level courses layout.

```text
content/
  thumbnails.config.json                 optional
  operating-systems/
    category.json                        optional
    thumbnail.jpg                        optional
    mastering-debian-linux/
      meta.json                          optional
      thumbnail.jpg                      optional
      volumes/
        volume-0-prologue.md
        volume-0-prologue.jpg             optional sidecar
        volume-1-the-shell.md
  databases/
    trees-data-structures/
      volumes/
        volume-1-foundations.md
        btree-nbtree-guide.md             supply your missing original
  networking/                            may be empty
```

To add content: create a category directory, a course inside it, a `volumes` directory, and Markdown files. Refresh the browser. No restart, build, JSON registry, or frontmatter is needed. Adding a volume or changing text is equally immediate. A direct course under the content root is assigned to synthesized **Uncategorized**. A real category with that name gets a disambiguated route. Dot-directories and the reserved shared **assets** directory are ignored. Non-course directories inside categories produce a warning. Empty categories and empty courses render useful empty states. Directory symlinks and Markdown symlinks are not followed.

All content paths below are relative to the content root, including metadata thumbnail paths. You can use an absolute `CONTENT_ROOT` for a different disk. An absent root produces an empty library.

### Metadata

Category metadata uses the same optional `title`, `description`, `id`, `order`, `thumbnail`, and `access` fields as course metadata. The optional files are named meta.json for courses and category.json for categories. Example (a template, not a required file):

```json
{
  "id": "my-stable-course-id",
  "title": "An excellent technical course",
  "description": "What you will learn.",
  "order": 5,
  "thumbnail": "assets/course.png",
  "access": { "visibility": "public", "freeVolumes": null }
}
```

Optional Markdown frontmatter:

```yaml
---
id: stable-volume-id
title: Volume 3 — A custom title
order: 3
description: A short summary.
draft: false
thumbnail: assets/chapter.png
access: { tier: free }
---
```

`draft: true` omits a volume. Missing or malformed access objects log a warning and default to `{}`; unknown fields are preserved. Valid access metadata is **inert in open mode**. Invalid JSON/frontmatter never crashes discovery. Metadata parse warnings appear in development; production displays a generic notice and leaves details in the server log.

### Titles, identities, and ordering

1. A valid frontmatter `title` wins.
2. If the first heading is H1 and its introductory H2 precedes body content, H2 is the volume title; H1 is the book title. Blank lines/thematic separators do not interfere.
3. Otherwise the first H1 is used.
4. Otherwise the filename becomes a readable title, with volume/numeric prefixes removed.

Course title: metadata → first ordered published volume's H1 → title-cased folder name. Course description: metadata → a concise generated volume-count description. Category display names similarly remove numeric prefixes.

Volume order: numeric frontmatter `order` → filename `volume-N-` or `N_`/`N-` → unnumbered last, alphabetically by filename. Zero is valid; 10 follows 9. Categories/courses use numeric metadata order → numeric folder prefix → alphabetical display title. Numeric metadata overrides prefixes. Ties are deterministic.

Route segments normalize Unicode, keep letters/numbers, replace punctuation with hyphens, and are URL-encoded. Slug collisions within the same directory receive deterministic hash suffixes. Routes are category/course scoped. Metadata IDs take precedence over derived path IDs; volume IDs are `courseId/explicitVolumeId` or `courseId/volumeSlug`. Duplicate IDs warn and receive a path-derived fallback. Use IDs **before renaming** if progress/entitlements must survive the change. IDs survive renames, but old URLs are not redirected; the continue link is reconstructed from current IDs.

## Routes and full source tree

```text
/
/all
/c/<category>
/c/<category>/<course>
/c/<category>/<course>/<volume>
/api/search?q=<query>
/thumb?node=<category/course/volume-route-key>
```

Every source file is complete in this workspace. There are no placeholder implementations or omitted file fragments.

```text
infodump/
├── .env.example
├── .gitignore
├── .vscode/
│   └── tasks.json
├── access.config.js
├── next.config.mjs
├── package.json
├── package-lock.json
├── playwright.config.js
├── README.md
├── CHAPTERS.md
├── VERIFICATION.md
├── scripts/
│   ├── seed.mjs
│   ├── split-chapters.mjs
│   └── verify-chapters.mjs
├── src/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js
│   │   ├── globals.css
│   │   ├── error.js
│   │   ├── not-found.js
│   │   ├── all/page.js
│   │   ├── c/[...segments]/page.js
│   │   ├── api/search/route.js
│   │   └── thumb/route.js
│   ├── components/
│   │   ├── Catalog.js
│   │   ├── ClientState.js
│   │   ├── FocusMode.js
│   │   ├── ReaderControls.js
│   │   └── Reader.js
│   └── lib/
│       ├── content.js
│       ├── markdown.js
│       ├── request.js
│       ├── state.js
│       ├── thumbnails.js
│       └── access/
│           ├── audit.js
│           ├── demo.js
│           ├── policy.js
│           └── viewer.js
├── tests/
│   ├── architecture.test.js
│   ├── chapters.test.js
│   ├── split-chapters.test.js
│   ├── content.test.js
│   ├── markdown.test.js
│   ├── fixtures.js
│   ├── server.mjs
│   └── browser/platform.spec.js
├── content/
│   ├── thumbnails.config.json
│   ├── databases/
│   │   ├── category.json
│   │   └── trees-data-structures/volumes/
│   │       ├── volume-1-foundations.md
│   │       ├── volume-2-binary-tree-family.md
│   │       ├── volume-3-btrees-and-disk.md
│   │       ├── volume-4-specialized-trees.md
│   │       ├── volume-5-concurrency-and-durability.md
│   │       └── volume-6-synthesis-and-frontiers.md
│   ├── networking/
│   │   └── category.json
│   └── operating-systems/
│       ├── category.json
│       └── mastering-debian-linux/volumes/
│           ├── volume-0-prologue.md
│           ├── volume-1-the-shell.md
│           ├── volume-2-users-permissions-processes.md
│           ├── volume-3-the-filesystem.md
│           ├── volume-4-package-management.md
│           ├── volume-5-networking.md
│           ├── volume-6-the-boot-process.md
│           ├── volume-7-scripting-and-automation.md
│           ├── volume-8-advanced-and-synthesis.md
│           └── volume-9-epilogue.md
└── course/                              untouched original 16-file corpus
  ├── Data Structure/Tree/
  │   ├── volume-1-foundations.md
  │   ├── volume-2-binary-tree-family.md
  │   ├── volume-3-btrees-and-disk.md
  │   ├── volume-4-specialized-trees.md
  │   ├── volume-5-concurrency-and-durability.md
  │   └── volume-6-synthesis-and-frontiers.md
  └── Linux/Debian/
    ├── volume-0-prologue.md
    ├── volume-1-the-shell.md
    ├── volume-2-users-permissions-processes.md
    ├── volume-3-the-filesystem.md
    ├── volume-4-package-management.md
    ├── volume-5-networking.md
    ├── volume-6-the-boot-process.md
    ├── volume-7-scripting-and-automation.md
    ├── volume-8-advanced-and-synthesis.md
    └── volume-9-epilogue.md
```

Generated dependency/build/test-output directories are excluded from this tree and from Git. The workspace task starts the development server.

## Markdown and reading behavior

**Focus mode:** click the fullscreen-corners icon at the bottom-right while reading. All site navigation, headers, sidebars, TOC, progress controls, and pagination disappear, leaving the document in a full-window reading layout. Native browser fullscreen is requested when supported; otherwise the same distraction-free layout fills the browser viewport. Press **Escape** or use the discreet exit icon to return. Reading position is approximately preserved across layout changes. Focus mode is temporary, not persisted, and never changes content authorization or existing progress/theme storage keys.

[markdown.js](src/lib/markdown.js) uses gray-matter, remark-parse, remark-gfm, remark-math, remark-rehype, rehype-katex, rehype-highlight, and rehype-stringify. All Markdown processing is server-side. No raw Markdown or unredacted body AST is serialized to client components.

- Math uses **double-dollar delimiters**; single-dollar math is intentionally disabled to avoid shell/currency ambiguities. Fenced code and inline code are parsed as code nodes first, so `/proc/$$/environ`, inline `$$`, and nested shell blocks stay literal. Real corpus and synthetic regression tests verify this, not merely library assumptions.
- Unlabelled fences remain plain `<pre><code>`; highlight detection is explicitly disabled. Only recognized labels are highlighted; unknown labels remain readable.
- The monospace stack is Cascadia Mono → DejaVu Sans Mono → Noto Sans Mono → Liberation Mono → Consolas → Courier New → monospace. Ligatures/contextual alternates are disabled. Code uses `white-space: pre`, no wrapping, fixed tab stops, and horizontal overflow. Markdown's normal fence indentation and CRLF normalization apply; diagram text otherwise remains intact.
- Tables have their own horizontally scrollable region. Math displays can scroll too. Grid tracks and content columns have `min-width: 0`; long code cannot expand the page.
- Heading IDs and TOC entries come from the **same AST and GitHub slugger instance**. H2/H3 only appear in the TOC; duplicate headings receive suffixes. Code spans, em-dashes, punctuation, section symbols, and Unicode use deterministic slugger behavior.
- Reading time is `ceil(prose words/220 + code lines/35 + table rows/12)`, minimum one minute. Table cell text is included in prose words, plus a row inspection allowance. This is a rough technical-reading estimate, not pure prose speed.
- Raw HTML/MDX is not executed; dangerous link schemes are removed. Relative body images show an explanatory text placeholder rather than a broken image. Remote body images are supported. Local **thumbnail** images have the full secured serving pipeline; arbitrary local Markdown attachments are deliberately not exposed.
- Completion auto-triggers after actual scrolling past 95% of a long article. Short pages are manual-only. A manual mark/unmark becomes an explicit override; subsequent scrolling does not change it. Clearing browser state is the current way to reset an override. Partial/denied volumes cannot be marked complete.
- Resume positions are article-relative ratios, not brittle whole-page coordinates. Explicit heading links take precedence over restoration. Major edits or image-height changes can shift the approximate position; there is no text-range anchoring.
- Native page links intentionally request fresh content and do not prefetch every long volume. Breadcrumbs contain all four levels; mobile navigation is a keyboard-accessible drawer with Escape and focus containment.

## Dynamic loading, search, and caching

[content.js](src/lib/content.js) is the only content gateway imported by routes. Every request re-enumerates directories, rereads metadata/thumbnail config, and stats Markdown. React's request-local cache deduplicates the layout/page work only within the current request; it does not cache access decisions across requests or viewers.

A bounded process-memory LRU caches parsed Markdown by realpath + mtime + ctime + size: **256 documents / 16 MiB source-byte accounting**, whichever limit is reached first. AST memory is larger than the source-byte budget; this is not a 16 MiB RSS guarantee. For chapter folders, a volume-wide AST is assembled for reference resolution and preview enforcement, but only the requested chapter is rendered to the browser. Deleted files cannot be reached through stale cache entries because discovery happens again. No persistent server state, generated manifest, or watcher is required.

**Search design: small API, not a downloadable full-text index.** Category/course title and description filtering is immediate in the browser using metadata already needed for cards. At two characters, a debounced (250 ms) API request searches category/course metadata, volume titles, and permitted body text. Requests are cancelled when typing continues. Query length is capped at 160 characters, output at 40 results, snippets around 200 characters. Each result includes its category → course → volume path. Search is global even when initiated inside a category.

Search builds permitted searchable text on the server, per request and viewer. It checks `list`, `read`, `search-index`, and `search-result`, and truncates previews **before text extraction**. The raw parser cache is server-only; there is no viewer-shared response cache and no browser index containing locked text. JSON and image responses use `private, no-store` for access correctness and immediate edits. A future policy does not require replacing search.

## Browser persistence

All persistent reading state is **localStorage**, with no cookies. Values are versioned and scoped to the explicit viewer's ID. Identifiers are encoded using `encodeURIComponent`; IDs may contain slashes/colons safely.

```text
cp:v1:<viewer>:progress:<courseId>:<volumeId>
  { complete: boolean, manual: boolean, updatedAt: epochMilliseconds }

cp:v1:<viewer>:position:<courseId>:<volumeId>
  { ratio: numberBetween0And1, updatedAt: epochMilliseconds }

cp:v1:<viewer>:last
  { categoryId, courseId, volumeId }

cp:v1:<viewer>:theme
  "light" | "dark"
```

Example actual key:

```text
cp:v1:local:progress:operating-systems%2Fmastering-debian-linux:operating-systems%2Fmastering-debian-linux%2Fvolume-0-prologue
```

- **Completion:** localStorage because it must survive reloads, never needs a server, and should not be sent with requests. Explicit manual intent is stored alongside the value.
- **Position/last-read:** localStorage, debounced while scrolling and flushed on pagehide. Each volume has its own position; last-read references stable IDs. Continue is resolved against the current server-authorized catalog, so hidden/deleted content never reappears through local history.
- **Theme:** localStorage for the same reasons. A blocking inline head script reads it **before page paint**, falling back to `prefers-color-scheme`. The initial HTML suppresses the expected theme-attribute hydration difference. System changes are followed until an explicit preference is saved.
- **Search:** never persisted. Browser state is only current input/results.

Storage parse failures are ignored; unavailable/full localStorage displays a warning and falls back to in-memory state. Storage events refresh progress across tabs. There is no cross-device sync or atomic multi-tab edit protocol.

**Aggregation:** category progress is completed volumes / total listed published volumes across all its courses, weighted by volume count. Course progress uses the same rule within one course. A ten-volume course contributes ten units, not the same weight as a one-volume course. Locked listed volumes remain in the denominator; hidden/draft volumes do not. No separate aggregate value is persisted, so additions/deletions recalculate on refresh.

## Thumbnail resolution and serving

The global config is optional and read on every request. Example template:

```json
{
  "map": {
    "operating-systems": "assets/os.jpg",
    "operating-systems/mastering-debian-linux": "assets/debian.png",
    "operating-systems/mastering-debian-linux/volume-0-prologue": "assets/prologue.jpg"
  },
  "patterns": {
    "databases/*": "assets/database-default.jpg",
    "*/*/volume-9-*": "assets/epilogue.jpg"
  },
  "defaults": { "category": "assets/category.jpg", "course": null, "volume": null },
  "inherit": true
}
```

Keys use **physical content paths**, not URLs, slugified names, or metadata IDs. Volume keys omit the `volumes/` segment and Markdown extension. Direct-course keys are `course-name` and `course-name/volume-name`.

Exact precedence:

1. Explicit metadata thumbnail.
2. Exact global `map` key.
3. Matching `patterns`, most specific first.
4. Sidecar.
5. Parent's resolved real thumbnail, only when `inherit: true`.
6. Type default.
7. Stable generated placeholder.

**Global config deliberately overrides sidecars.** Invalid/missing/disallowed local sources log and fall through. For matching patterns, specificity is longest literal prefix before the first `*`, then fewest wildcard characters, then alphabetic pattern text as the tie-break. `*` stays in one path segment; `**` spans zero or more segments. When the best match cannot resolve, the next matching pattern is tried.

Sidecars match the basename case-insensitively. Extension priority: **AVIF → WebP → PNG → JPG → JPEG → SVG**. Equal-extension case variants use sorted filenames. Categories/courses use `thumbnail`; volumes use the Markdown basename. Generated parent placeholders are not inherited: children try their type default, then get their own identity-derived placeholder. `inherit` defaults to false when omitted.

Sources: relative to content, absolute local paths, or HTTP(S). Absolute paths are accepted **only inside content or explicitly allowed roots**. `THUMBNAIL_ROOTS` contains absolute asset directories separated by the platform path delimiter: semicolon on Windows, colon on POSIX. Do not allow an entire drive merely for convenience.

[thumbnails.js](src/lib/thumbnails.js) resolves real paths and verifies `path.relative` containment against real allowed roots, including at serving time. Parent-segment traversal, outside symlinks, unsupported extensions, and missing/unreadable files are rejected. The handler accepts a **node key**, not an arbitrary filename; it rescans authorized nodes and rechecks `list`, `thumbnail`, and volume `read`. Local paths never appear in image URLs. Denied categories cascade to image endpoints, including inherited images requested through children.

Local image responses have explicit MIME, `nosniff`, and sandbox/default-none CSP (including SVG), with `private, no-store`. This intentionally favors hot edits and policy correctness over image caching. Remote sources are **redirected to the HTTP(S) URL after authorization**, not fetched by the server: no SSRF proxy is introduced. Their availability cannot be certified without making a remote request; a browser load error uses a deterministic colored initials placeholder. Remote owners see the browser request, and previously learned remote URLs cannot be revoked by this application. Use local files for genuinely gated images.

The browser-visible thumbnail schema is `{ url, origin }`; origin is `metadata`, `map`, `pattern`, `sidecar`, `inherited`, `default`, or `placeholder`. Real local paths remain server-only. Generated placeholders are inline SVG derived from a SHA-256 hash of stable node ID, with initials and no external service. An unexpected image-load failure has a second stable CSS placeholder fallback.

## Access seam — open today

There is exactly one decision module: [policy.js](src/lib/access/policy.js), exposing `can(viewer, action, resource, context)`. It invokes [audit.js](src/lib/access/audit.js), currently a cheap no-op. Resources contain their type, stable ID, relevant parent IDs, volume order, and parsed access object. Parent descriptors are passed as context so policies can inspect ancestor metadata too.

[viewer.js](src/lib/access/viewer.js) returns `{ id: 'local', kind: 'owner', grants: ['*'] }`. [request.js](src/lib/request.js) resolves it once per page request and threads it through; API/image requests resolve it once at their entry point. No user storage, cookies-for-auth, session code, or login UI exists.

Enforcement points:

| Exposure/action | Enforcement |
|---|---|
| Home/category/all-course listings | `scanLibrary` → `list` for categories and courses |
| Course/sidebar volume listing | `list` for each volume |
| Volume HTML and headings | `loadVolume` → `read`, then AST truncation |
| Search text construction | `search-index` and `read`, then permitted-tree extraction |
| Search response entries | `search-result`, with fresh ancestor/list checks |
| Next/previous targets | `navigate`; denied neighbors become disabled, not silently skipped |
| Continue target | resolves last ID against freshly authorized catalog/read decision |
| Progress/manual mark | server-derived `progressAllowed` from `progress` and full `read`; both manual and auto paths require it |
| Images | node lookup + `list`, `thumbnail`, and volume `read` |

Metadata discovery remains server-side and must parse metadata/frontmatter to know IDs and access fields. It does not send file bodies to the browser. This is an **exposure gate**, not filesystem encryption: the server process necessarily has the content on disk. All runtime Markdown reads are contained in the one content gateway, with access checks before results are exposed. The thumbnail helper only reaches a route through that gateway.

The policy layer performs ancestor cascade centrally: an ancestor denied for `list` or the requested action denies the descendant. Components do not recreate entitlement rules. Decisions are `allow`, `deny` with lock metadata, or `partial` with a heading/percent limit. Preview truncation uses top-level H2/H3 section boundaries, preserving whole code fences/tables/blockquotes. H1/preamble can precede the first permitted section. Percent limits are converted to a proportion of section boundaries, **not byte percentages**. Rendering and search share the truncator. Only the permitted HTML/TOC crosses the server boundary; CSS is never used to hide withheld text.

### Demo policy

[access.config.js](access.config.js) defaults to `mode: 'open', policyModule: null`. `ACCESS_MODE` overrides the mode. Unknown modes/missing selections fall back to open. A selected policy module that throws or returns an invalid decision **fails closed**, rather than accidentally granting access. Custom policy modules are trusted local ES modules exporting a default function; `ACCESS_POLICY` can name `demo` or a project-relative/absolute module path.

PowerShell:

```powershell
$env:ACCESS_MODE = 'policy'
$env:ACCESS_POLICY = 'demo'
npm run dev
```

POSIX:

```bash
ACCESS_MODE=policy ACCESS_POLICY=demo npm run dev
```

The demo in [demo.js](src/lib/access/demo.js) is **7 lines**, including its declaration and closing brace. It:

- Hides the second nonempty category in deterministic directory-discovery order, exercising category → course → volume/image/search cascade. With only one category, its second course is the hidden target.
- Denies reading/search/navigation/progress for volumes with numeric order 4 or above in visible courses, but retains locked sidebar entries.
- Makes order-1 volumes three-heading previews; prevents completion of previews.

The rule is positional, not hardcoded to Debian/Trees. It needs two nonempty categories (or two courses in one category) and numbered volumes to demonstrate every behavior. The generic catalog context includes category/course positions and nonempty-category count; the loader has no demo rules, special hidden flags, or mode checks. Changing the demo requires **only a policy implementation**, not alternate renderers, routes, or search logic.

To restore open mode, stop the server and remove the variables, then restart:

```powershell
Remove-Item Env:ACCESS_MODE -ErrorAction SilentlyContinue
Remove-Item Env:ACCESS_POLICY -ErrorAction SilentlyContinue
npm run dev
```

Environment/config changes are startup configuration, unlike content and thumbnail JSON edits, which require only refresh. No code changes or content rebuild is needed when switching modes.

### How to add real authentication later

The contained identity/entitlement integration is four files, in order:

1. [viewer.js](src/lib/access/viewer.js): replace local-owner resolution with validated request identity using the future chosen authentication system. All request entry points already support an async resolver.
2. Add an entitlement adapter module under the access directory: resolve grants/expiry for that viewer. The storage/provider choice is intentionally not made now.
3. Add a real policy module in the same directory: implement list/read/partial/progress decisions using those entitlements and stable resource IDs.
4. [access.config.js](access.config.js): choose policy mode and the new module. Optionally update [audit.js](src/lib/access/audit.js) as a fifth file to enqueue access events.

Actual login/callback/logout pages and provider-specific session establishment would be **additional new files**, not a four-file authentication product. They are explicitly out of scope today. The claim is that existing content loaders, renderer, navigation, search redaction, and thumbnail serving do not need an entitlement rewrite. This is the seam, not prebuilt auth scaffolding.

## Honest limits and scaling

- **Per-request disk cost:** scanning and statting is linear in the content tree, unlike static generation. Every image request also scans to avoid stale authorization or stale config. Warm parser caching avoids repeated AST construction for this corpus, but does not remove metadata I/O or directory walks. Cold access and slow/network disks can be noticeable. This trades throughput for instant edit discovery and simple operation.
- **Search is not a database:** substring matching has no stemming, typo tolerance, language-aware tokenization, BM25 ranking, pagination beyond the first 40, or semantic retrieval. Browser-only filtering cannot search bodies it has not downloaded; this app uses the server API for that reason. A database-free inverted index is possible later but still needs update, memory, and per-viewer redaction design.
- **At 10× (~16–17 MiB, ~160–170 volumes, potentially 1,500+ chapters):** catalog metadata and every scan grow roughly 10×. The 256-document/16-MiB-source LRU will churn during full searches, reparsing evicted documents; single-process CPU and AST heap become real costs. There is no claim this implementation has been benchmarked at that scale. Larger caches, request single-flight, file watchers with request-time reconciliation, per-file search-text caches, worker-thread parsing, paged catalogs, and bounded/concurrent thumbnail lookup are the logical next steps. There is no serverless/static-export support.
- **Untrusted gigantic inputs:** there is no strict file-size/scan-count quota. A huge file or pathological Markdown can consume server memory/CPU. This is a trusted local corpus, not a public upload service. Add pre-read limits and worker isolation before accepting hostile uploads.
- **State is not authoritative:** localStorage can be edited or cleared; it is per browser/device, not a server entitlement or grading record. Cross-tab conflicts are last-write-wins. A future identity must isolate browser profiles appropriately and use authoritative server-side policies for content, never progress flags.
- **Security scope:** there is no authenticated identity to enforce against today. Anyone with filesystem access reads everything, regardless of the web policy. Local machine administrators, hostile filesystem writers/races, malicious custom policy modules, and compromised browser extensions are outside this design's protection. Metadata warnings deliberately expose local paths in development to aid debugging. Do not expose the dev server as a multi-tenant product.
- **Previously delivered material cannot be recalled:** downloaded Markdown-derived HTML, browser caches/history outside the app, screenshots, external thumbnails, and copied text cannot be revoked. `no-store` prevents this app from deliberately caching gated responses, not human copying.

## Tests

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests use two local **production** servers on ports 3100/3101 and isolated disposable content roots under the ignored temporary directory. They do not mutate your real content. Unit/integration tests also use temporary fixtures; renderer tests additionally read the supplied original corpus. Preserve the archival original directory to run that particular real-corpus regression, or adapt its fixture source for a different checkout.

See [VERIFICATION.md](VERIFICATION.md) for the actual acceptance results and remaining limitations, rather than treating the presence of tests as proof they ran.