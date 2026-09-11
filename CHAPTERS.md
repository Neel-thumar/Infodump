# Chapter-based reading

The live library is now **16 volumes containing 158 chapter/section files**. This includes overview pages, exercises, retrospectives, and epilogues—not 158 invented textbook chapters. All original text is retained.

## Reader controls

- **← / →** in the sticky toolbar or on the keyboard move between chapters. At the first/last chapter the unavailable direction is disabled. Separate bottom links change volumes.
- The **chapter dropdown** jumps to any available chapter. Expand volumes in the sidebar to see chapters and completion indicators.
- Keyboard shortcuts leave inputs, selects, buttons, selected text, open dialogs/settings, and focused scrollable code/tables alone. Arrows in a dropdown still perform native selection.
- **Aa / settings** changes text size (16–26 px), reading width (comfortable/wide/fill), and independently shows/hides the sidebar, section outline, site header, breadcrumbs, chapter heading, progress/completion controls, bottom navigation, and toolbar.
- The sidebar and outline have hide buttons. The toolbar menu restores the sidebar (or opens a mobile drawer). A small **gear button** restores a hidden toolbar. **Reset** restores defaults.
- Focus mode still shows just the document and a discreet exit button. Escape exits. The original document heading remains visible in focus mode; normal mode avoids repeating it below the page heading.
- On narrow screens the outline starts as a compact expandable bar rather than consuming the first screen of reading.

The refreshed reader uses a neutral slate dark background, brighter text, clearer table borders, larger code/table text, and a wider fluid column. Hiding panels returns space to the article. Code and diagrams still never wrap.

## Physical layout

```text
content/<category>/<course>/volumes/
  .originals/
    volume-1-name.md              byte-exact full-volume backup
  volume-1-name/
    volume.json                  optional volume metadata
    chapters/
      00-overview.md
      01-chapter-1-topic.md
      02-chapter-2-topic.md
```

Chapter files are discovered from disk at request time. Add/edit/rename a chapter and refresh; no rebuild, restart, or maintained registry. Standalone Markdown volumes remain supported. A folder volume takes precedence over a same-basename standalone file. Dot-directories, including the originals archive, are never published.

Volume metadata carries `id`, `title`, `bookTitle`, `description`, `order`, `draft`, `access`, and `thumbnail`. Generated metadata also records `sourceFilename`, `sourceSha256`, and chapter-title fallbacks. The title map is **not a file registry**: newly added chapters appear automatically, and edited chapter headings update their titles.

Chapter ordering: numeric frontmatter order, then numeric filename prefix, then filename. Chapter title: frontmatter title, first heading, then filename. The migrated overview retains original volume frontmatter for lossless reconstruction; that frontmatter's volume title/order/ID is not misinterpreted as chapter metadata. The overview stays first.

## Routes and state compatibility

Chapter routes are `/c/<category>/<course>/<volume>/<chapter>`. Existing volume URLs redirect to the first available chapter. Volume IDs are unchanged. Old hash bookmarks may need to be reselected from the new outline; cross-chapter Markdown heading links are rewritten to chapter routes. Shared Markdown reference definitions are resolved across the volume server-side.

- Chapter completion uses the existing viewer-scoped, versioned progress key format with **chapter ID** as the final segment. Chapter ID defaults to `volumeId/chapterSlug`; optional chapter frontmatter ID replaces its slug.
- Position uses the existing position key format with chapter ID. Continue stores both `volumeId` and `chapterId` and resolves them against the authorized current catalog.
- Volume completion is computed from chapter completions. Existing explicit volume completion/uncompletion takes precedence, preserving old manual intent. Old whole-volume offsets cannot safely map to new chapters and are not guessed; old continue entries open the overview.
- Manual chapter unmark always wins over scrolling. Category/course progress remains weighted by completed volumes; the expanded sidebar additionally shows completed chapters per volume.
- The sidebar's **Volume completion** disclosure can explicitly mark/unmark a whole volume. **Use chapter progress** removes only that volume-level override and resumes automatic aggregation, without deleting chapter progress. This also lets you change overrides retained from before migration.
- Reader preferences use **`cp:v1:<encodedViewerId>:reader`** in localStorage, for example `{ "sidebar": false, "toc": true, "fontSize": 21, "width": "wide" }`. No server state or cookies were introduced.

## Split and audit commands

From the project root:

```powershell
npm run chapters:plan
npm run chapters:split
npm run chapters:verify
```

**Plan** is read-only. **Split** writes chapter folders and archives full originals; it has already run on the supplied corpus. Rerunning is a no-op for converted volumes, while new standalone volumes can be converted later. **Verify** concatenates chapter files in numeric order and compares bytes/SHA-256 to metadata and archives. Legitimate later chapter edits are reported as differences; the verifier never reverts them.

For a different content root:

```powershell
node scripts/split-chapters.mjs --root="D:\MyLibrary" --write
```

Close editors actively saving source volumes during conversion. Existing destinations/archives cause an error rather than an overwrite. Each volume is staged, verified, published, and backed up; its standalone input is removed only after byte checks pass. Failed writes roll back owned output. This is per-volume protection, not a transaction spanning the entire corpus. A hard process/power interruption may leave output/staging folders requiring inspection before retry.

Splitting uses AST heading offsets, not regexes over raw lines. Real H1 chapters, exercises, and retrospectives become separate pages. The initial book/volume introduction becomes an overview. Without later H1 headings, H2 boundaries split shorter works such as the prologue. Code, math, blockquotes, tables, CRLF, Unicode, whitespace, and original frontmatter are byte-exact. The archival [course](course/) tree is untouched.

## Access and performance

The server checks the existing volume policy and ancestor cascade, applies preview limits **once across the whole volume**, and then selects a chapter. Direct chapter URLs cannot restart the preview allowance. Withheld chapters are omitted from navigation, HTML, RSC, and search. Search returns chapter-level links and full category/course/volume/chapter paths.

Only the selected permitted chapter's HTML/TOC reaches the reader. The server still combines a volume AST to preserve shared references, stable heading anchors, and global preview limits. This reduces browser DOM/response size, **not all server work**. Filesystem scanning remains linear. The parser LRU is now **256 documents / 16 MiB source-byte accounting**, enough for the split corpus; actual AST heap is larger. The previously documented 10× scaling limitations still apply.

## Verified conversion

The independent audit reports **16 volumes, 158 chapter/section files, zero differences from archived originals**: Trees has 62 files across six volumes; Debian has 96 across ten volumes. The earlier progress message's 139 count was an undercount; the byte-level verifier is authoritative.

See [VERIFICATION.md](VERIFICATION.md) for test results and [README.md](README.md) for base setup.