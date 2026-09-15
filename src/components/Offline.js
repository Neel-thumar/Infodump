'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CONCURRENCY, COURSE_PREFIX, META, courseCache } from '../lib/offline/cache.js';

const Offline = createContext(null);
export const useOffline = () => useContext(Offline) || { supported: false, offline: false, downloads: {}, progress: {} };

// Turbopack rewrites chunk URLs on every edit, so a dev service worker would cache rubble.
const enabled = () => process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SW_DEV === '1';

// Page HTML references this build's chunks, so a download has to take them along or the
// first offline load has markup and no application. This page's own assets come from the
// DOM; the other pages' come out of their HTML as they are fetched, because the catalog and
// the reader do not import the same chunks.
function currentPageAssets() {
  const urls = new Set(['/', '/all']);
  const add = value => {
    try {
      const url = new URL(value, location.href);
      if (url.origin === location.origin) urls.add(url.pathname + url.search);
    } catch { /* Skip anything that is not a usable URL. */ }
  };
  for (const node of document.querySelectorAll('link[rel="stylesheet"][href],script[src]')) add(node.href || node.src);
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.includes('/_next/static/')) add(entry.name);
  }
  return [...urls];
}

const ASSET_REFERENCE = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
const assetsIn = html => [...html.matchAll(ASSET_REFERENCE)].map(match => match[1]);

async function readDownloads() {
  const records = {};
  for (const name of (await caches.keys()).filter(n => n.startsWith(COURSE_PREFIX))) {
    const cache = await caches.open(name);
    const meta = await cache.match(META);
    if (meta) { const record = await meta.json(); records[record.courseId] = record; }
    else await caches.delete(name); // No record at all: an orphan from an older version.
  }
  return records;
}

export function OfflineProvider({ children }) {
  const [supported, setSupported] = useState(false);
  const [offline, setOffline] = useState(false);
  const [downloads, setDownloads] = useState({});
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const running = useRef(new Set());

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    addEventListener('online', sync); addEventListener('offline', sync);
    return () => { removeEventListener('online', sync); removeEventListener('offline', sync); };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('caches' in window) || !enabled()) return;
    let live = true;
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(readDownloads)
      .then(records => { if (live) { setSupported(true); setDownloads(records); } })
      .catch(() => { /* No offline support in this browser or context; the site works as before. */ });
    return () => { live = false; };
  }, []);

  // The loop lives here rather than in the worker: a service worker whose waitUntil runs for
  // minutes gets terminated, which silently truncates a long download.
  const download = useCallback(async course => {
    if (running.current.has(course.id)) return;
    running.current.add(course.id);
    setError('');
    setProgress(previous => ({ ...previous, [course.id]: { done: 0, total: 0 } }));
    try {
      const response = await fetch(`/api/offline?course=${encodeURIComponent(course.id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('This course could not be prepared for offline reading.');
      const plan = await response.json();
      const cache = await caches.open(courseCache(plan.courseId));
      const queue = [...plan.pages, ...plan.images, ...currentPageAssets()];
      const seen = new Set(queue);
      let total = queue.length, done = 0, failed = 0;
      // Claim the cache before the first fetch, so an interrupted download is recognisable
      // rather than looking like an orphan to the next visit.
      const record = { courseId: plan.courseId, title: plan.title, count: 0, failed: 0, savedAt: Date.now(), complete: false };
      await cache.put(META, Response.json(record));
      setProgress(previous => ({ ...previous, [course.id]: { done: 0, total } }));
      const worker = async () => {
        while (queue.length) {
          const url = queue.shift();
          try {
            // Resuming: whatever a previous attempt already saved is not fetched again.
            if (!await cache.match(url)) {
              const page = await fetch(url, { credentials: 'same-origin', cache: 'reload' });
              if (page.ok) {
                const copy = page.clone();
                // A cached redirect replayed for a navigation throws; store the destination.
                await cache.put(page.redirected ? new URL(page.url).pathname : url, page);
                if ((page.headers.get('content-type') || '').includes('text/html')) {
                  for (const asset of assetsIn(await copy.text())) {
                    if (!seen.has(asset)) { seen.add(asset); queue.push(asset); total++; }
                  }
                }
              } else failed++;
            }
          } catch { failed++; }
          done++;
          setProgress(previous => ({ ...previous, [course.id]: { done, total } }));
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      const finished = { ...record, count: total - failed, failed, savedAt: Date.now(), complete: true };
      await cache.put(META, Response.json(finished));
      setDownloads(previous => ({ ...previous, [course.id]: finished }));
    } catch (e) {
      setError(e.message);
      setDownloads(await readDownloads());
    } finally {
      running.current.delete(course.id);
      setProgress(previous => { const next = { ...previous }; delete next[course.id]; return next; });
    }
  }, []);

  const remove = useCallback(async courseId => {
    setError('');
    await caches.delete(courseCache(courseId));
    setDownloads(previous => { const next = { ...previous }; delete next[courseId]; return next; });
  }, []);

  return <Offline.Provider value={{ supported, offline, downloads, progress, download, remove, error }}>{children}</Offline.Provider>;
}

export function OfflineBanner() {
  const { offline, downloads } = useOffline();
  if (!offline) return null;
  const count = Object.keys(downloads).length;
  return <div className="offline-banner" role="status">
    <span aria-hidden="true">◍</span> You're offline.
    {count ? ` ${count} downloaded course${count === 1 ? '' : 's'} and recently read pages are still available.` : ' Pages you have already visited are still available.'}
  </div>;
}

export function DownloadCourse({ course }) {
  const { supported, downloads, progress, download, remove, error, offline } = useOffline();
  const [confirming, setConfirming] = useState(false);
  if (!supported || !course?.volumes?.length) return null;
  const saved = downloads[course.id], active = progress[course.id];

  if (active) {
    const percent = active.total ? Math.round(active.done / active.total * 100) : 0;
    return <div className="offline-control" aria-live="polite">
      <span className="offline-state">Downloading {active.total ? `${active.done} of ${active.total}` : '…'}</span>
      <div className="offline-track"><span style={{ width: `${percent}%` }} /></div>
      <span className="offline-state">Keep this tab open until it finishes.</span>
    </div>;
  }
  if (saved) return <div className="offline-control">
    {saved.complete === false
      ? <><span className="offline-state">Download interrupted — some chapters are missing</span><button onClick={() => download(course)} disabled={offline}>Finish download</button></>
      : <span className="offline-state done">✓ Available offline{saved.failed ? ` · ${saved.failed} item${saved.failed === 1 ? '' : 's'} missing` : ''}</span>}
    {confirming
      ? <><button onClick={() => { remove(course.id); setConfirming(false); }}>Remove download</button><button onClick={() => setConfirming(false)}>Keep</button></>
      : <button onClick={() => setConfirming(true)}>Remove</button>}
  </div>;
  return <div className="offline-control">
    <button onClick={() => download(course)} disabled={offline} title={offline ? 'Reconnect to download this course' : 'Save every chapter to this device'}>⇩ Download for offline</button>
    {error && <span className="offline-state" role="alert">{error}</span>}
  </div>;
}
