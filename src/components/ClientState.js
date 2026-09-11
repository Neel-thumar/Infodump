'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { statePrefix, progressKey, autoComplete, toggleComplete } from '../lib/state.js';

const State = createContext(null);
export const useReading = () => useContext(State);
export function ClientState({ viewer, children }) {
  const [values, setValues] = useState({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const load = () => {
      try {
        const next = {}, prefix = statePrefix(viewer.id);
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefix) && !key.endsWith(':theme')) {
            try { next[key] = JSON.parse(localStorage.getItem(key)); } catch { /* Ignore corrupt entries. */ }
          }
        }
        setValues(next);
      } catch { setStorageError(true); }
      setReady(true);
    };
    load(); window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, [viewer.id]);
  function save(key, value) {
    setValues(previous => ({ ...previous, [key]: value }));
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { setStorageError(true); }
  }
  function complete(course, volume, manual = false) {
    if (!volume.progressAllowed || !ready) return;
    const key = progressKey(viewer.id, course.id, volume.id);
    // Read latest storage to avoid racing an observer with a manual unmark or another tab.
    let previous = values[key];
    try { previous = JSON.parse(localStorage.getItem(key)) || previous; } catch { /* Session fallback. */ }
    if (!previous && volume.chapters?.length) previous = { complete: isComplete(course, volume) };
    save(key, manual ? toggleComplete(previous) : autoComplete(previous));
  }
  const isComplete = (course, volume) => {
    const stored = values[progressKey(viewer.id, course.id, volume.id)];
    if (stored?.manual || stored?.complete) return stored.complete === true;
    return !!volume.chapters?.length && volume.chapters.every(chapter => values[progressKey(viewer.id, course.id, chapter.id)]?.complete === true);
  };
  function resetCompletion(course, volume) {
    if (!volume.progressAllowed || !ready) return;
    const key = progressKey(viewer.id, course.id, volume.id);
    setValues(previous => { const next = { ...previous }; delete next[key]; return next; });
    try { localStorage.removeItem(key); } catch { setStorageError(true); }
  }
  return <State.Provider value={{ viewer, values, save, ready, complete, isComplete, resetCompletion }}>
    {storageError && <div className="notice" role="status">Browser storage is unavailable. Reading state works for this visit but may not survive a reload.</div>}
    {children}
  </State.Provider>;
}

export function Header() {
  const { viewer } = useReading();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === 'dark');
    sync();
    const observer = new MutationObserver(sync); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    const system = () => { try { if (localStorage.getItem(`${statePrefix(viewer.id)}theme`)) return; } catch { /* Use system. */ } document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'; };
    media.addEventListener('change', system);
    return () => { observer.disconnect(); media.removeEventListener('change', system); };
  }, [viewer.id]);
  return <header className="topbar"><a className="brand" href="/"><span className="brand-mark">i.</span> infodump<span className="brand-caption"> / YOUR LOCAL LIBRARY</span></a>
    <nav aria-label="Main"><a href="/all">All courses</a><button className="theme-toggle" aria-label="Toggle color theme" onClick={() => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next; setDark(next === 'dark');
      try { localStorage.setItem(`${statePrefix(viewer.id)}theme`, next); } catch { /* Nonpersistent theme. */ }
    }}>{dark ? '☀' : '☾'}<span className="sr-only">Toggle theme</span></button></nav>
  </header>;
}