# Verification record

Verified on Windows, 2026-09-11. Node 24.13.0, Next.js 16.3.4. This records executed checks, not just intended behavior.

## Final results

| Check | Result |
|---|---|
| Dependency installation | Successful; npm reported 0 vulnerabilities at installation |
| `npm test` | **33 passed, 0 failed, 1 skipped** (Windows file-symlink privilege unavailable) |
| `npm run build` | **Successful**, all content routes reported dynamic |
| `npm run test:e2e` | **8 passed, 0 failed**, Chromium, two isolated production servers |
| Editor diagnostics | No errors reported |
| Development app | Running at http://127.0.0.1:3000 with the supplied real content |
| Original preservation | All 16 copies SHA-256 match their originals |
| Demo policy | **7 nonempty lines**; demo-specific decisions exist only in its policy module |

The final browser rerun followed a test-only Windows fix: wait for outstanding thumbnail requests before renaming the temporary content root. Windows can reject renaming a directory whose image files are still open. No real content was deleted or renamed by the tests.

## Actual source corpus versus the requested description

### Chapter-reader migration

The live content has been migrated to chapter folders. `npm run chapters:verify` independently reports **16 volumes, 158 chapter/section files, zero byte/SHA-256 differences** from the archived originals. Debian: 96 files; Trees: 62. The original full volumes also remain in hidden per-course archives, and the archival source tree is untouched. The early progress message's 139 count was incorrect; this audit supersedes it.

Tests cover lossless CRLF/frontmatter/code/math/Unicode slicing, safe no-overwrite behavior, rollback on write failure, idempotency, chapter discovery/routes, shared references, whole-volume preview enforcement, chapter search, keyboard navigation, chapter completion, and reader settings persistence. The browser test exercises hide/restore for panels and the toolbar, text size, width, and reset. See [CHAPTERS.md](CHAPTERS.md) for current usage and limitations.

- Supplied: **16 Markdown files, 1,559,326 bytes, 33,949 lines**.
- Debian: **10**; Trees: **6**.
- The unnumbered B-tree guide was **absent**. It is exercised as a synthetic fixture, not claimed as supplied content.
- Longest parsed code line in the available corpus: **134 characters**. The specified **440-character** case is tested with an explicit code-fence fixture at desktop and 390-pixel mobile widths. It was not falsely attributed to the available files.
- The originals remain in [course](course/); runtime copies are in [content](content/).

## Core acceptance

- [x] Renamed header/logo and browser title to **infodump**. Existing progress/theme storage keys remain unchanged.
- [x] Reader focus icon enters native fullscreen, hides site chrome, and leaves document content visible. Exit restores the reader. Unsupported-fullscreen mobile fallback and Escape are tested. Focus mode also checked in the real Debian shell volume in the integrated browser.

- [x] Ten **distinct** Debian sidebar titles: real-corpus test and integrated browser DOM check.
- [x] Numeric zero sorts first; numerical 9 → 10 order verified by a hot-added fixture.
- [x] Unnumbered B-tree guide gets its H1 title and sorts last: synthetic fixture, because the original is missing.
- [x] Course-scoped volume routes do not collide.
- [x] Bash `/proc/$$/environ` remains literal: renderer test and **7 matching code blocks** observed in the real shell volume.
- [x] Inline-code `$$` remains code, and code nested in a blockquote remains code.
- [x] Real foundations volume renders KaTeX: **13 math elements** observed in the browser.
- [x] Real foundations diagrams stay unhighlighted: **17 plain box-drawing code blocks** observed.
- [x] Exact box-drawing text comparison passes; unlabeled blocks have no highlighting class.
- [x] A 440-character fixture line horizontally scrolls; no page overflow at desktop or mobile width; computed whitespace is `pre`.
- [x] Nested blockquote code renders correctly: synthetic test plus real shell volume.
- [x] Adding a volume appears without restarting the production server.
- [x] Adding a bare course/category works with no metadata or image.
- [x] Temporarily removing the content root shows the empty state, not an exception.
- [x] Manual unmark survives additional scrolling and reload, without silent auto-recompletion.
- [x] Dark preference survives reload; the inline head script initializes it independently of hydration.
- [x] H2/H3 TOC anchors resolve; punctuation and duplicate heading slugs are covered in renderer tests. Foundations exposes **95 TOC entries** in the live browser.
- [x] Four-level breadcrumbs, previous/next boundaries, completion buttons, local search filtering, API search, and no-results UI are exercised.
- [x] Mobile sidebar opens as a dialog, traps focus, and closes with Escape.
- [x] Empty Markdown, malformed frontmatter/access, and a simulated `EACCES` file read return notices rather than crashing. The permissions case injects an error; it does not alter Windows ACLs.

## Access seam acceptance

- [x] Zero-config startup is open. No authentication UI, user store, session code, database, or auth SDK is present.
- [x] Source search finds **one exported `can()`**: [policy.js](src/lib/access/policy.js).
- [x] Runtime filesystem imports are confined to [content.js](src/lib/content.js) and its [thumbnail helper](src/lib/thumbnails.js). No client component imports either gateway. The architecture regression also guards this boundary.
- [x] The content gateway has no `ACCESS_MODE`, `ACCESS_POLICY`, or demo-specific hidden flags. It passes only generic catalog positions and resource/ancestor metadata to the policy.
- [x] Demo mode hides a category and its courses, displays locked volumes 4+, and renders an order-1 volume as exactly three H2/H3 sections.
- [x] Locked text is absent from the **actual HTML network response** and an **RSC response**, not merely hidden in the DOM.
- [x] Preview-withheld text is absent from the actual HTML response and search response. This was checked using unique sentinel strings after the cutoff.
- [x] Hidden category deep links return 404. Its image endpoint returns 404. Its content does not appear in search.
- [x] Search-index construction and search-result emission both run access decisions; previews truncate before body-text extraction.
- [x] Parent denials cascade in the policy module. Multiple partial limits intersect instead of letting a child widen its parent's preview.
- [x] Preview and locked completion are disabled; denied next targets are disabled.
- [x] Unsetting policy environment variables restores discovery in the integration test; the two browser servers demonstrate open and policy behavior with the same production build.
- [x] Access metadata is parsed and carried through without affecting open-mode behavior. Missing/malformed values default to open and log.
- [x] Browser keys are viewer-scoped, encoded, and versioned; completion and theme keys were inspected in Chromium localStorage.

## Categories and thumbnails

- [x] The real home page shows **3 categories**, including empty Networking; its course count is zero and its page displays an empty state.
- [x] A direct-root course appears under synthesized Uncategorized.
- [x] Category progress uses combined volume counts. Completing one of ten fixture volumes updates the category to **10%**.
- [x] Continue displays category → course → volume and restores the recorded article-relative position.
- [x] Category/course/volume thumbnail discovery shares one resolver with level-specific basename conventions.
- [x] Exact map entries override existing sidecars.
- [x] More-specific matching patterns outrank broader ones.
- [x] Missing configured files log and fall through to sidecar/inheritance/default/placeholder resolution.
- [x] Removing a course sidecar produces a working fallback, not a broken image.
- [x] Case-insensitive sidecar matching is exercised using an uppercase extension/name.
- [x] Malformed thumbnail JSON leaves the site usable and surfaces a visible notice; full parse details are logged.
- [x] Editing config changes the reported thumbnail origin without restarting the server.
- [x] With no images/config, generated placeholders use a stable ID-derived color and initials.
- [x] `origin` identifies metadata/map/pattern/sidecar/inherited/default/placeholder sources in resolver assertions and browser DOM checks.
- [x] Traversal via thumbnail query/path is rejected with 400/404, never filesystem content.
- [x] Absolute outside-root paths and an outside-root symlink/junction are rejected; an explicitly allow-listed asset root is accepted.
- [x] Denied-category thumbnails do not leak through direct requests.

## What was not claimed or benchmarked

- The missing real B-tree guide cannot be visually verified until it is supplied. Its irregular structure is covered by a fixture.
- No 10× load benchmark, hostile-upload test, multi-user authentication test, or cross-device progress sync was performed. The implementation's linear scanning and cache-churn limits are described in [README.md](README.md).
- HTTP(S) thumbnail URLs are redirected rather than fetched by the server. Remote availability is checked only by the browser; failure produces a stable placeholder, not server-side probing or a guarantee of remote uptime. This avoids introducing an SSRF proxy.
- This is a local personal application with extensibility seams, **not** a completed access-security product. Filesystem access, already-downloaded material, localStorage tampering, and hostile local filesystem races are outside its protection.

For commands, complete source tree, configuration examples, persistence schema, and the small future-auth integration surface, see [README.md](README.md).