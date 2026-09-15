# Downloadable courses & opening them from disk — feasibility

**The question:** can a reader download a course, and on a later visit click "open my
downloaded courses", pick the folder, and read it straight from disk with no server calls?

**Short answer:** yes, and the "pick a folder / grant permission" popup you described is a
real browser flow, not a hack. But it is **Chromium-only**, and "no server calls" needs one
more piece you may not have counted on. Details below, then a layered design that works
everywhere.

---

## 1. The exact API you're describing

The File System Access API:

```js
// Download: user picks where, we write files there.
const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'infodump' });
const file = await dir.getFileHandle('manifest.json', { create: true });
const writable = await file.createWritable();
await writable.write(JSON.stringify(manifest));
await writable.close();

// Keep the handle — it survives a reload.
await idbPut('handles', 'library', dir);

// Next visit, behind a click:
const dir = await idbGet('handles', 'library');
if (await dir.queryPermission({ mode: 'read' }) !== 'granted') {
  await dir.requestPermission({ mode: 'read' });   // ← your popup
}
for await (const [name, handle] of dir.entries()) { /* read chapters */ }
```

Three facts that make this work:

- `FileSystemDirectoryHandle` is **structured-cloneable**, so it can be stored in IndexedDB
  and retrieved on a later visit. The folder path is remembered for you.
- `requestPermission()` needs a **user gesture** — which is exactly your "user clicks
  *Open your downloaded courses*" step. It cannot be done silently on page load.
- Chrome now has a **persistent-permission** prompt: if the handle was granted last visit
  and stored in IndexedDB, re-requesting offers "Allow on every visit", so the reader is not
  nagged forever.

Requires a secure context — HTTPS, or `localhost` / `127.0.0.1`, so `npm run dev` is fine.

### Where it doesn't work

| Browser | `showDirectoryPicker` / `showSaveFilePicker` |
| --- | --- |
| Chrome 86+, Edge 86+, Opera 72+ | ✅ |
| **Firefox** | ❌ — origin-private file system only |
| **Safari** (macOS, iOS, iPadOS) | ❌ — origin-private file system only |

Firefox and Safari implement OPFS (`navigator.storage.getDirectory()`), which is real
storage but **invisible to the user** — no folder they can see, copy or back up. So the
picker flow is a Chromium enhancement, never the baseline.

---

## 2. The catch: "no server calling" needs a service worker

Reading chapters from disk removes the *content* requests. It does not remove the request
for the app itself — the Next.js HTML, the JS bundle, `globals.css`, `katex.min.css`. Open
the site with no network and you get the browser's offline page before any of your code
runs.

Two separate problems:

| Goal | Needs |
| --- | --- |
| Content available offline | a local copy — Cache Storage **or** a picked folder |
| The app itself loads offline | a **service worker** precaching the app shell |

The service worker is required either way. And once you have one, it can cache the chapter
HTML too — which makes the simplest version of this feature work in **every** browser, with
no picker and no permission popup at all.

Also offline-dead without a local copy: `/api/search` (the Catalog's search box calls it)
and `/thumb` (every course and volume image). A bundle has to include a search index and
the images, or those features break offline.

---

## 3. Recommended design: three layers

### Layer 1 — "Download for offline" (works everywhere, do this first)

A service worker with a Cache Storage bucket per course. "Download" precaches every chapter
route, the search index, thumbnails and the app shell. Next visit, online or off, it just
works — no picker, no popup, no permission.

- Universal: Chrome, Firefox, Safari, mobile.
- Invisible and frictionless.
- Shows real progress ("Downloading 42 of 58 chapters…") and a size estimate.
- **Weakness:** it is site data. "Clear browsing data" deletes it, and Safari's ITP evicts
  it after 7 days without a visit. Call `navigator.storage.persist()` to reduce that risk.

### Layer 2 — "Save a portable copy…" (Chromium, your original idea)

For readers who want a file they actually own:

1. `showDirectoryPicker({ mode: 'readwrite' })` → they pick e.g. `Documents/infodump`.
2. We write one subfolder per course, and store the handle in IndexedDB.
3. Next visit, because a handle exists, the home page shows **"Open your downloaded
   courses"**. One click → `requestPermission()` → your popup → chapters read from disk.
4. New courses downloaded later go into the same folder — no re-picking.

This is the layer that matches the project's "all data on your side" thesis: the folder
survives clearing site data, can be copied to a USB stick or a second machine, and can be
opened without the site at all if we also write a standalone `index.html` reader into it.

### Layer 3 — "Open a course file…" (universal fallback for Firefox/Safari)

Plain `<input type="file">` — supported everywhere, no API needed. The reader picks the
`.infodump` bundle they downloaded; we read it with the File API and cache the parsed
result in IndexedDB so the pick is needed once per browser, not once per visit. No
persistent handle is possible, so if they clear site data they re-pick the file.

**Feature detection decides which to offer:**

```js
const canPickFolders = 'showDirectoryPicker' in window;   // Chromium
```

---

## 4. What goes in a bundle

Everything needed to render without the server. The pipeline already produces all of it
server-side (`renderDocument` in `src/lib/markdown.js`), so the bundle carries **pre-rendered
HTML** — no markdown, remark, rehype, KaTeX or highlight.js needed on the client.

```
infodump/
  library.json                 ← which courses are present, bundle format version
  devops-docker/
    manifest.json              ← volume/chapter tree, ids, titles, order, word counts,
                                 reading time, libraryVersion, content hash
    chapters/
      01-....html              ← pre-rendered, one file per chapter (lazy-read)
    search.json                ← local index, replaces /api/search
    assets/thumb-*.webp        ← replaces /thumb
    assets/katex.min.css, highlight.css, globals.css
    index.html                 ← optional standalone reader; opens with no site at all
```

**Folder, not zip.** With a directory handle you write plain files — no zip dependency, and
you can read one chapter at a time instead of unpacking the whole course into memory. For
the Layer 3 single-file fallback, use one gzipped JSON via the native `CompressionStream`
API, which also avoids adding a zip library.

**Producing it** needs one server endpoint — `GET /api/export?course=…` — which walks the
course through the existing access policy and streams back the file list. That is a server
call at *download* time, which is expected and fine.

---

## 5. Two things to get right

**Security.** `Reader` renders content with `dangerouslySetInnerHTML`. Feeding it HTML from
a file the user picked off their disk is an XSS vector — a swapped or hand-edited bundle
executes script in the origin, with access to all the profile data. Pick one:

- store a SHA-256 of each chapter in `manifest.json`, hash on load, refuse on mismatch
  (protects against tampering, not against a bundle the attacker generated wholesale);
- sanitize the HTML on load before injecting;
- or render bundle content inside a **sandboxed iframe**, which is the strongest option and
  costs you the shared CSS and scroll integration.

**Staleness.** A downloaded course is a snapshot. Put `libraryVersion` and a content hash in
the manifest, compare against the live library when online, and show "3 chapters updated —
refresh this download". Silently serving month-old content is the failure mode that makes
offline features feel broken.

---

## 6. Interaction with the personalization work

The two designs share a spine — see `PERSONALIZATION.md`:

- Reading progress must keep working offline. Progress lives in `localStorage`/IndexedDB
  already, so it does; the cookie sync just queues until the next online request.
- The `/you` settings page is the natural home for "Downloaded courses" — size on disk,
  folder location, refresh, remove.
- `navigator.storage.persist()` serves both features and should be requested once, in one
  place.
- Layer 1's service worker is item 16 on the personalization feature list, so it is one
  piece of work, not two.

---

## 7. Layer 1, as built

Layer 1 is implemented. Files:

| File | Role |
| --- | --- |
| `public/sw.js` | the worker — **reads only**: serves cached pages, assets and thumbnails offline |
| `src/lib/offline/cache.js` | cache names and concurrency, shared by page and worker |
| `src/lib/offline/plan.js` | which URLs a course needs, derived from the access-filtered library |
| `src/app/api/offline/route.js` | serves that plan; a withheld course simply reads as unknown |
| `src/components/Offline.js` | `OfflineProvider`, `OfflineBanner`, `DownloadCourse` — and the download loop |
| `tests/offline.test.js` | plan coverage, redirect avoidance, and worker/module agreement |

Three things the build surfaced that the design above did not anticipate:

**The download loop cannot live in the service worker.** The first implementation drove it
from the worker via `postMessage` and `event.waitUntil`. It reached 78 of 97 chapters and
stopped dead: the browser terminates a worker whose `waitUntil` runs for minutes. The loop
now runs in the page, which lives as long as the tab, and writes to Cache Storage directly —
the window has the same `caches` API. The worker no longer has a `message` handler at all,
and a test asserts it never grows one back.

**A partly-downloaded course must be recognisable.** The record is written to the cache
*before* the first fetch, with `complete: false`, and rewritten at the end with
`complete: true`. Without it, a second tab reading status would see a half-filled cache with
no record, treat it as an orphan, and delete it mid-download. An interrupted download now
shows "Finish download", and resuming skips whatever was already saved.

**Downloading is slow, and that is the app's shape, not the worker's.** Every chapter page
is a dynamic render that re-scans the library and re-parses the whole volume, so a chapter
costs seconds. Two concurrent fetches already saturate the server; more buy no throughput
and only starve the reader's own clicks. If downloads should be faster, the fix is upstream —
cache the library scan, or add an export endpoint that renders a whole course in one pass.

Registration is gated to production builds (`npm run build && npm run start`), because
Turbopack rewrites chunk URLs on every edit and a dev worker would cache rubble. Set
`NEXT_PUBLIC_SW_DEV=1` to register in `next dev` anyway.

## 8. Verdict

Your flow is buildable exactly as you described it, in Chrome and Edge, and the folder
permission popup is a supported browser feature rather than something to work around. But
build Layer 1 first: a service worker gets you real offline reading in every browser for
less work, and it is the prerequisite for "no server calls" no matter which storage the
content ends up in. Layer 2 then becomes what it should be — a "save a portable copy you
own" feature for the readers who want one — instead of the only thing standing between the
reader and a blank page.

---

## Sources

- [File System API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [File System Access API — caniuse](https://caniuse.com/native-filesystem-api)
- [Persistent permissions for the File System Access API — Chrome for Developers](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [`FileSystemHandle.queryPermission()` — MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission)
- [Persistent file handling with the File System Access API](https://transloadit.com/devtips/persistent-file-handling-with-the-file-system-access-api/)
