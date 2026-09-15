# Client-side personalization — research & design

**Goal:** keep 100% of reader data on the reader's device, use cookies where they earn
their keep, and spend that data on a visibly better experience.

**Scope of this document:** research findings, a storage architecture, a ranked feature
list, and a file-by-file implementation plan. No code has been changed yet.

---

## 1. Where we are today

All reader state lives in `localStorage` under `cp:v1:<viewerId>:` (`src/lib/state.js`):

| Key | Written by | Holds |
| --- | --- | --- |
| `progress:<course>:<node>` | `ClientState.complete` | `{complete, manual, updatedAt}` per volume *and* per chapter |
| `position:<course>:<node>` | `Reader` scroll handler | `{ratio, updatedAt}` |
| `reader` | `useReaderPreferences` | font size, width, 8 panel toggles |
| `theme` | `Header` toggle | `dark` / `light` |
| `last` | `Reader` scroll handler | last `{categoryId, courseId, volumeId, chapterId}` |

`viewer.id` is hard-coded to `'local'` (`src/lib/access/viewer.js`), the server reads no
cookies at all, and every route is `force-dynamic`.

### Four concrete problems

1. **Everything pops in after hydration.** `ClientState` starts with `values = {}` and
   `ready = false`, so the server ships `0 / 44 volumes complete`, `0%` progress bars and
   no Continue card. They swap in after JS runs. `layout.js` already works around the
   theme half of this with a blocking inline `<script>` — that trick doesn't scale to
   font size, reading width, panel visibility or progress.
2. **Safari deletes this data.** Safari's ITP wipes *all script-writable storage* —
   `localStorage`, `IndexedDB`, `sessionStorage`, service worker caches — after 7 days
   without a user interaction on the site, and caps `document.cookie` lifetimes to 7 days
   too. **First-party cookies set by the server via the `Set-Cookie` header are exempt**
   and keep their declared `Max-Age`. For a "come back next month and continue" library,
   that single fact is the whole argument for cookies.
3. **No portability.** No export, no import, no way to move a profile between devices —
   and with no accounts, there is no other path.
4. **O(n) scan on every mount.** `ClientState` iterates the entire `localStorage`
   keyspace on load and on every `storage` event.

---

## 2. Research findings

### Cookie limits (2026)

| Limit | Value |
| --- | --- |
| Bytes per cookie (name + value + attributes) | 4096 in Chrome/Safari, 4097 in Firefox |
| Cookies per domain | 180 Chrome/Edge, 150 Firefox, ~50 Safari |
| Max `Expires` / `Max-Age` | **400 days**, clamped by all Chromium browsers |
| Sent on | *every* same-origin request — pages, RSC payloads, `/api/search`, `/thumb` |

That last row is the real constraint. Cookies are not storage, they are a tax on every
request. A 3 KB cookie adds ~3 KB to each of the ~30 requests a page makes.

### Safari ITP

- The 7-day cap applies to script-writable storage and to cookies written by `document.cookie`.
- HTTP `Set-Cookie` on a genuine first-party domain, with `Secure` + `SameSite`, is not
  capped — it honours `Max-Age` up to the 400-day browser ceiling.
- **Implication: write cookies from the server, never from `document.cookie`.**

### Next.js 16 specifics (verified against `node_modules/next/dist/docs/`)

- `cookies()` from `next/headers` is **async** (`await cookies()`).
- **Cookies cannot be set during a Server Component render.** `.set()` only works in a
  Server Function (`'use server'`) or a Route Handler. Writes need a real endpoint.
- **`middleware.js` is deprecated in 16 and renamed to `proxy.js`.** A root `proxy.js`
  exporting `proxy(request)` is the right place to mint a first-visit ID cookie, because
  it runs before render and can attach `Set-Cookie` to the response.
- `'use cache: private'` (needs `cacheComponents: true`) caches a function that reads
  `cookies()`, in browser memory only, never on the server. This is the sanctioned Next 16
  escape hatch if we ever move off `force-dynamic`.

### Cookie Store API

`cookieStore` reached Baseline in mid-2025 (Chrome 87+, Safari 18.4+, Firefox 138+).
Async, and it has a `change` event — useful for cross-tab sync without polling. But it is
still `document.cookie` for ITP purposes, so it does not buy persistence. Treat it as a
nice-to-have, feature-detected, never load-bearing.

---

## 3. Proposed architecture: three tiers

> **The rule that decides everything:** a cookie carries only what the *server must know
> to render the first paint correctly*. Everything else stays in richer client storage.

### Tier 1 — Cookies (server-readable, budget ≈ 1.2 KB total)

All `httpOnly: true`, `sameSite: 'lax'`, `secure` in production, `path: '/'`,
`maxAge: 400 * 86400`. `httpOnly` is deliberate: the client never needs to *read* these —
the server decodes them and passes the values down as props to `ClientState`. It also
means page scripts (and any XSS) cannot touch the durable copy.

| Cookie | Size | Contents | What it buys |
| --- | --- | --- | --- |
| `idp_id` | ~40 B | opaque UUID, `priority: 'high'` | replaces `viewer.id = 'local'`; namespaces storage; enables profile switching and future merge |
| `idp_ui` | ~45 B | theme, font size, width, 8 panel toggles as a bitmask | server emits `data-theme` and `--reader-font-size` in the HTML — the inline theme script and every preference flash disappear |
| `idp_rs` | ~90 B | `courseId\|volumeId\|chapterId\|ratio\|ts` | Continue card rendered server-side, in the HTML |
| `idp_pg` | ~110 B | completion **bitmap**, base64url, + library version tag | progress rings correct on first paint |

**Why a bitmap.** The library is 4 categories / 5 courses / 44 volumes / 548 chapters =
592 completable nodes. One bit each = 74 bytes → 99 base64url characters. At ten times the
current size it is still under 1 KB — one cookie, forever.

**The fragility this raises, and the fix.** Bit positions depend on node ordering, so
inserting a chapter shifts everything after it. So the cookie is **a projection, never the
source of truth**:

- `localStorage` stays authoritative and keyed by human-readable IDs.
- On every change the client re-derives the bitmap and POSTs it, stamped with the current
  `libraryVersion` (a hash the server already computes when scanning content).
- The server trusts the bitmap **only** when the version tag matches; otherwise it renders
  the un-personalized shell for one paint and the client re-syncs.
- **If `localStorage` is empty but the cookie is present** — the Safari-wipe case, or a
  cleared-site-data case — the flow reverses and we rehydrate `localStorage` from the
  cookie. Cookie as first-paint cache *and* as disaster recovery.

Deliberately **not** in cookies: scroll ratios per chapter, notes, highlights, session
logs, search history. The server does not need them at render time, so they must not ride
along on every `/thumb` request.

### Tier 2 — `localStorage` (~5 MB, synchronous, the working store)

Keep today's keys, add: bookmarks, per-chapter percent-read, pinned courses, catalog sort
preference, dismissed hints, "known" glossary terms.

One fix: replace the full-keyspace scan with a single `cp:v2:<id>:index` document plus
per-item keys, so mount cost stops growing with the library.

### Tier 3 — IndexedDB (large, structured, where the interesting data lives)

This is what actually powers personalization, and none of it belongs in a cookie:

- **Session log** — `{nodeId, startedAt, endedAt, msActive, scrollDepth, viewport}` per
  reading session.
- **Words-per-minute samples** — derived from the session log.
- **Highlights and margin notes** — with text offsets and bodies.
- **Search history** — queries plus which result was clicked.
- **Revisit signals** — backward scrolls, re-opens, long dwells on one section.

Call `navigator.storage.persist()` behind a real UI affordance ("Keep my library on this
device"). It asks the browser not to evict under storage pressure, and it makes the
durability promise visible instead of implicit.

### Where writes happen

```
Reader/Header/Catalog  →  localStorage (immediate, optimistic)
                       →  IndexedDB   (session log, batched)
                       →  debounced 2s + visibilitychange:hidden + pagehide
                              ↓  navigator.sendBeacon / fetch(keepalive)
                          POST /api/state   (Route Handler)
                              ↓
                          cookies().set(...)   ← the only place cookies are written
```

Use **both** `visibilitychange: 'hidden'` and `pagehide`. `pagehide` alone is unreliable on
mobile Safari, and a `Set-Cookie` on a beacon response fired at teardown is best-effort.

---

## 4. What this makes possible, ranked by value per unit of work

**Tier A — first paint, no new UI, pure quality:**

1. **Zero-flash personalized shell.** Theme, font size, reading width and panel visibility
   arrive in the server HTML. Delete the inline theme script in `layout.js`.
2. **Server-rendered Continue card.** In the markup, not after hydration.
3. **Correct progress rings on first paint** — `44 volumes` stops being the first thing a
   returning reader sees.

**Tier B — genuinely personal, built on the session log:**

4. **Reading time at *your* pace.** `rendered.minutes` is a fixed global WPM estimate.
   Replace it with the reader's measured WPM: *"14 min at your pace"*. Highest
   personalization-per-line-of-code in this list.
5. **Time-to-finish** for a volume and a course, from remaining word counts × personal WPM.
6. **Rich resume.** Not just a link — *"60% through Chapter 12, about 6 minutes left"*,
   plus a subtle "you left off here" marker in the prose.
7. **Per-chapter percent-read in the sidebar**, replacing the binary `✓ / ○`.
8. **Streaks and cadence.** One bit per day for a year = 46 bytes. *"7-day streak"*,
   *"you usually read on Tuesday evenings"*.
9. **A revisit queue.** Chapters with heavy back-scrolling or unusually long dwell get
   flagged *"worth a second pass"*.

**Tier C — library-level personalization:**

10. **Next-up recommendations** from finished categories, dwell time and search history.
    Scored entirely client-side.
11. **"New since your last visit"** — server compares the cookie's library version against
    current content and highlights added chapters.
12. **Highlights and margin notes**, exportable with the profile.
13. **Personal search history** surfaced in the search box.
14. **Pinned courses, hide-completed, custom catalog order.**
15. **Milestones** — volume complete, course complete, 10 hours read.
16. **Offline reading** — a service worker precaches the next two chapters on the reader's
    trajectory. Downloadable courses and reading them from a folder on disk are designed
    separately in [`OFFLINE-COURSES.md`](./OFFLINE-COURSES.md).

**Tier D — the thing that makes "all data on your side" honest:**

17. **Export / import profile as JSON**, on a `/you` settings page, alongside a full
    breakdown of what is stored and a one-click reset. With no accounts, this *is* the
    device-transfer story. A URL-fragment or QR handoff would make it a feature rather
    than a chore.

---

## 5. Implementation plan

New files:

| File | Purpose |
| --- | --- |
| `proxy.js` (repo root) | mint `idp_id` on first request — Next 16's renamed `middleware.js` |
| `src/lib/profile/codec.js` | bitmap + packed-value encode/decode, base64url, versioned |
| `src/lib/profile/cookies.js` | cookie names, options, `readProfile(cookieStore)` |
| `src/app/api/state/route.js` | the only cookie writer; validates and clamps every field |
| `src/lib/profile/sessions.js` | IndexedDB session log + WPM derivation |
| `src/app/you/page.js` | stats dashboard, export / import, reset, persistence opt-in |

Changed files:

| File | Change |
| --- | --- |
| `src/lib/access/viewer.js` | return the cookie-backed ID instead of `'local'` |
| `src/lib/request.js` | add a cached `requestProfile()` next to `requestViewer()` |
| `src/app/layout.js` | decode the profile, set `data-theme` / `--reader-font-size` server-side, **remove the inline theme script**, pass `initialProfile` to `ClientState` |
| `src/components/ClientState.js` | seed from `initialProfile` (so `ready` is true on first render), reconcile with `localStorage`, rehydrate from cookie when empty, debounce the sync |
| `src/components/Reader.js` | feed the session log; render personal reading time and the resume marker |
| `src/components/Catalog.js` | server-seeded Continue card and progress |

**Suggested order.** Phase 1 (items 1–3) is self-contained, touches five files, and is
where the visible quality jump is — worth doing on its own before anything else. Phase 2
adds the IndexedDB session log and items 4–7. Phase 3 is the `/you` page and export/import.
Phase 4 is recommendations and offline.

---

## 6. Privacy

Everything here is first-party, stays on the device, and reaches no third party — that is
already the site's promise ("● Local & private"). Two things are worth being deliberate
about if this is ever served to the public:

- Storage that is strictly necessary for a feature the reader asked for (progress, resume,
  preferences) is consent-exempt under ePrivacy. A **behavioural session log kept for
  recommendations generally is not** — so Tier 3 should sit behind a one-time
  "personalize my experience" opt-in.
- The `/you` page should show exactly what is stored, in plain language, with export and
  reset. That is also the best advertisement for the privacy model.

---

## Sources

- [Cookie `Expires`/`Max-Age` upper limit — Chrome for Developers](https://developer.chrome.com/blog/cookie-max-age-expires)
- [Browser cookie limits (2026)](https://www.w3tutorials.net/blog/what-are-the-current-cookie-limits-in-modern-browsers/)
- [Apple's 7-day cap on script-writable storage](https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage)
- [Safari — current status, cookiestatus.com](https://www.cookiestatus.com/safari/)
- [Cookie Store API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API)
- Next.js 16.3.4 bundled docs: `cookies`, `proxy.js`, `middleware.js` (deprecated), `use cache: private`
