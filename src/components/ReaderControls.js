'use client';
import { useEffect } from 'react';
import { statePrefix } from '../lib/state.js';
import { ThemeToggle, useReading } from './ClientState.js';

export const defaultPreferences = { sidebar: true, toc: true, header: true, breadcrumbs: true, title: true, progress: true, footer: true, toolbar: true, fontSize: 19, width: 'wide' };
export function useReaderPreferences() {
  const { viewer, values, save } = useReading();
  const key = `${statePrefix(viewer.id)}reader`;
  const raw = values[key] || {};
  const preferences = { ...defaultPreferences, ...raw,
    fontSize: Math.max(16, Math.min(26, Number(raw.fontSize) || 19)),
    width: ['comfortable', 'wide', 'full'].includes(raw.width) ? raw.width : 'wide' };
  const setPreference = (name, value) => save(key, { ...preferences, [name]: value });
  return { preferences, setPreference, reset: () => save(key, defaultPreferences) };
}

export default function ReaderControls({ volume, chapter, rendered, preferences, setPreference, reset, onMenu, menuRef, drawerOpen }) {
  useEffect(() => {
    const closeOutside = event => {
      const settings = document.querySelector('.reader-settings[open]');
      if (settings && !settings.contains(event.target)) settings.open = false;
    };
    const onKey = event => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest?.('input,textarea,select,button,[contenteditable="true"],pre,.table-scroll,[role="dialog"]')) return;
      if (window.getSelection()?.toString() || document.querySelector('.reader-settings[open]') || document.querySelector('.volume-sidebar.is-open')) return;
      const target = event.key === 'ArrowLeft' ? rendered?.previous : event.key === 'ArrowRight' ? rendered?.next : null;
      if (target) { event.preventDefault(); window.location.assign(target.url); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', closeOutside);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', closeOutside); };
  }, [rendered?.previous, rendered?.next]);
  return <div className="reader-toolbar" role="region" aria-label="Reading controls">
    {preferences.header && <a className="brand toolbar-brand" href="/" aria-label="infodump home"><span className="brand-mark" aria-hidden="true">i.</span><span className="brand-word">infodump</span></a>}
    <button ref={menuRef} className="panels-button" onClick={onMenu} title="Toggle course navigation" aria-label="Toggle course navigation" aria-controls="volume-sidebar" aria-expanded={drawerOpen || preferences.sidebar}>☰</button>
    <div className="chapter-switcher">
      {rendered?.previous ? <a className="step-button" href={rendered.previous.url} aria-label={chapter ? 'Previous chapter' : 'Previous volume'} title="Previous · Left arrow">←</a> : <button className="step-button" aria-label="Previous chapter" disabled>←</button>}
      {chapter ? <label className="chapter-select"><span className="sr-only">Go to chapter</span><select aria-label="Go to chapter" value={chapter.url} onChange={e => window.location.assign(e.target.value)}>{volume.chapters.map((ch, i) => <option key={ch.id} value={ch.url}>{i + 1} / {volume.chapters.length} · {ch.title}</option>)}</select></label> : <span className="toolbar-title">{volume ? 'Volume reader' : 'Course overview'}</span>}
      {rendered?.next ? <a className="step-button" href={rendered.next.url} aria-label={chapter ? 'Next chapter' : 'Next volume'} title="Next · Right arrow">→</a> : <button className="step-button" aria-label="Next chapter" disabled>→</button>}
    </div>
    <details className="reader-settings" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
      <summary aria-label="Reading settings" title="Reading settings">Aa <span aria-hidden="true">⚙</span></summary>
      <div className="settings-popover"><div className="settings-heading"><strong>Make it yours</strong><button onClick={reset}>Reset</button></div>
        <label className="font-control">Text size <output>{preferences.fontSize}px</output><input aria-label="Text size" type="range" min="16" max="26" value={preferences.fontSize} onChange={e => setPreference('fontSize', Number(e.target.value))} /></label>
        <label>Reading width<select aria-label="Reading width" value={preferences.width} onChange={e => setPreference('width', e.target.value)}><option value="comfortable">Comfortable</option><option value="wide">Wide</option><option value="full">Fill available space</option></select></label>
        <fieldset><legend>Show only what you need</legend>{Object.entries({ sidebar: 'Course navigation', toc: 'On this page', header: 'Site header', breadcrumbs: 'Breadcrumbs', title: 'Chapter heading', progress: 'Reading progress', footer: 'Bottom navigation', toolbar: 'Reading toolbar' }).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={e => setPreference(key, e.target.checked)} /></label>)}</fieldset>
        <p>← → Change chapters · Esc exits focus mode.<br />Arrow shortcuts pause while using inputs or scrolling code.</p>
      </div>
    </details>
    {preferences.header && <ThemeToggle />}
  </div>;
}