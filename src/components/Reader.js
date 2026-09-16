'use client';
import { useEffect, useRef, useState } from 'react';
import { useReading } from './ClientState.js';
import { positionKey, statePrefix } from '../lib/state.js';
import { chapterAnchor, fullVolumeUrl } from '../lib/reading-mode.js';
import { Breadcrumbs, Progress, Thumbnail } from './Catalog.js';
import FocusMode from './FocusMode.js';
import { DownloadCourse } from './Offline.js';
import ReaderControls, { useReaderPreferences } from './ReaderControls.js';

export default function Reader({ category, course, volume, rendered }) {
  const reading = useReading(), { viewer, values, save, complete, isComplete, ready } = reading;
  const [drawer, setDrawer] = useState(false), [percent, setPercent] = useState(0);
  const article = useRef(null), sidebar = useRef(null), menuButton = useRef(null), latest = useRef(reading);
  const sections = useRef(new Map()), autoCompleted = useRef(new Set());
  latest.current = reading;
  const allowed = rendered?.decision.effect !== 'deny';
  const chapter = rendered?.chapter, readingNode = chapter || volume;
  // Continuous mode: every chapter of this volume on one page.
  const full = rendered?.continuous ? rendered : null;
  const [activeChapter, setActiveChapter] = useState('');
  const chaptersDone = full ? full.chapters.filter(entry => isComplete(course, entry)).length : 0;
  const { preferences, setPreference, reset } = useReaderPreferences();
  // A lone outline entry repeating the page title is noise, so the column only earns its space at two or more.
  const tocItems = (rendered?.toc || []).filter((item, i) => !(i === 0 && item.text.trim() === (readingNode?.title || '').trim()));
  const showToc = preferences.toc && (full ? full.chapters.length > 1 : tocItems.length > 1);
  const [activeHeading, setActiveHeading] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Reading a volume merges the site header into the reader toolbar, so the page shows one top bar.
  const mergedBar = !!volume;
  useEffect(() => {
    document.body.toggleAttribute('data-reader-header-hidden', mergedBar || !preferences.header);
    return () => document.body.removeAttribute('data-reader-header-hidden');
  }, [mergedBar, preferences.header]);
  useEffect(() => {
    if (!article.current) return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.isIntersecting);
      if (entry) setActiveHeading(entry.target.id);
    }, { rootMargin: '-10% 0px -65% 0px' });
    article.current.querySelectorAll('h2[id],h3[id]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [readingNode?.id]);
  useEffect(() => {
    if (!drawer) return;
    const panel = sidebar.current, focusable = () => [...panel.querySelectorAll('a,button')];
    focusable()[0]?.focus();
    const handle = event => {
      if (event.key === 'Escape') setDrawer(false);
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); menuButton.current?.focus(); };
  }, [drawer]);
  useEffect(() => {
    if (!volume || !ready || !allowed || !article.current) return;
    const key = positionKey(viewer.id, course.id, readingNode.id);
    const saved = values[key];
    let frame, timer, touched = false;
    const element = article.current;
    const geometry = () => ({ top: element.getBoundingClientRect().top + window.scrollY, height: element.offsetHeight });
    if (saved && !window.location.hash) {
      frame = requestAnimationFrame(() => {
        const { top, height } = geometry();
        window.scrollTo(0, Math.max(0, top + Math.max(0, Math.min(1, saved.ratio || 0)) * height));
      });
    }
    const record = () => {
      const { top, height } = geometry();
      const ratio = Math.max(0, Math.min(1, (window.scrollY - top) / Math.max(1, height)));
      latest.current.save(key, { ratio, updatedAt: Date.now() });
      latest.current.save(`${statePrefix(viewer.id)}last`, { categoryId: category.id, courseId: course.id, volumeId: volume.id, chapterId: chapter?.id || null });
    };
    const update = () => {
      const { top, height } = geometry();
      const amount = Math.max(0, Math.min(1, (window.scrollY + window.innerHeight - top) / Math.max(1, height)));
      setPercent(Math.round(amount * 100));
      // Require actual scrolling and >=95% of the article; short pages are manual-only.
      if (touched && amount >= .95 && height > window.innerHeight && readingNode.progressAllowed) latest.current.complete(course, readingNode);
      clearTimeout(timer); timer = setTimeout(record, 300);
    };
    const onScroll = () => { touched = true; update(); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', record);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', record); record(); };
    // A volume gets one restoration; state updates must never jump the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingNode?.id, ready, allowed, viewer.id]);

  // Continuous mode tracks each chapter separately: one pass per frame marks any chapter the
  // reader has scrolled past and records which one the sticky navigation should highlight.
  useEffect(() => {
    if (!full || !ready || !allowed) return;
    let touched = false, frame = 0;
    const update = () => {
      let current = '';
      for (const entry of full.chapters) {
        const element = sections.current.get(entry.id);
        if (!element) continue;
        const top = element.getBoundingClientRect().top + window.scrollY, height = element.offsetHeight;
        if (top <= window.scrollY + 140) current = entry.id;
        const seen = (window.scrollY + window.innerHeight - top) / Math.max(1, height);
        // Mark once. autoComplete writes a fresh record on every call, so re-marking each
        // frame would rewrite storage for every chapter already behind the reader.
        if (touched && seen >= .95 && entry.progressAllowed && !autoCompleted.current.has(entry.id)) {
          autoCompleted.current.add(entry.id);
          latest.current.complete(course, entry);
        }
      }
      setActiveChapter(current || full.chapters[0]?.id || '');
    };
    const onScroll = () => { touched = true; if (frame) return; frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
    // The chapter list is fixed for the page; re-running on reading state would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, ready, allowed]);

  return <main id="main" className={`reader-shell ${!preferences.sidebar ? 'hide-sidebar' : ''} ${!showToc ? 'hide-toc' : ''} ${!preferences.breadcrumbs ? 'hide-breadcrumbs' : ''} ${!preferences.title ? 'hide-title' : ''} ${!preferences.progress ? 'hide-progress' : ''} ${!preferences.footer ? 'hide-footer' : ''} ${!preferences.toolbar ? 'hide-toolbar' : ''} measure-${preferences.width}`} style={{ '--reader-font-size': `${preferences.fontSize}px` }}>
    {!preferences.toolbar && <button className="restore-reader-controls" aria-label="Show reading controls" title="Show reading controls" onClick={() => setPreference('toolbar', true)}>⚙</button>}
    {volume && allowed && (rendered.html || full?.chapters.length) && <FocusMode key={readingNode.id} article={article} />}
    <div className="reading-meter" style={{ width: `${percent}%` }} />
    {drawer && <button className="drawer-backdrop" aria-label="Close volume navigation" onClick={() => setDrawer(false)} />}
    <aside ref={sidebar} id="volume-sidebar" className={`volume-sidebar ${drawer ? 'is-open' : ''}`} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label="Volume navigation">
      <button className="drawer-close" onClick={() => setDrawer(false)}>Close ✕</button><button className="sidebar-hide" onClick={() => setPreference('sidebar', false)} aria-label="Hide course navigation" title="Hide course navigation">⇤</button><a className="back-link" href={category.url}>← {category.title}</a>
      <h2><a href={course.url}>{course.title}</a></h2><Progress courses={[course]} />
      {chapter && <details className="volume-progress-controls"><summary>Volume completion</summary><button disabled={!ready || !volume.progressAllowed} onClick={() => complete(course, volume, true)}>{isComplete(course, volume) ? 'Unmark whole volume' : 'Mark whole volume complete'}</button><button disabled={!ready || !volume.progressAllowed} onClick={() => reading.resetCompletion(course, volume)}>Use chapter progress</button><p>Manual volume status overrides its chapters. Use chapter progress to return to automatic roll-up.</p></details>}
      <p className="eyebrow sidebar-label">COURSE CONTENT · {course.volumes.length} VOLUMES</p>
      <nav aria-label="Volumes">{course.volumes.map(v => <div key={v.id}><a href={v.url} aria-current={volume?.id === v.id ? 'page' : undefined} className={`volume-link ${volume?.id === v.id ? 'active' : ''}`}>
        <span className={`completion-icon ${isComplete(course, v) ? 'done' : ''}`}>{v.decision.effect === 'deny' ? '⊘' : isComplete(course, v) ? '✓' : '○'}</span><span>{v.title}{v.decision.effect === 'partial' && <small>PREVIEW</small>}</span>
      </a>{!!v.chapters?.length && <details className="chapter-list" open={volume?.id === v.id || undefined}><summary>{v.chapters.filter(ch => isComplete(course, ch)).length} / {v.chapters.length} chapters</summary>{v.chapters.map((ch, i) => <a className={chapter?.id === ch.id ? 'active' : ''} href={ch.url} key={ch.id} aria-current={chapter?.id === ch.id ? 'page' : undefined}><span>{isComplete(course, ch) ? '✓' : String(i + 1).padStart(2, '0')}</span>{ch.title}</a>)}</details>}</div>)}</nav>
    </aside>
    <div className="reader-content">{volume && <ReaderControls volume={volume} chapter={chapter} rendered={rendered} full={full} activeChapter={activeChapter} preferences={preferences} setPreference={setPreference} reset={reset} menuRef={menuButton} drawerOpen={drawer} onMenu={() => { if (matchMedia('(max-width: 700px)').matches) setDrawer(!drawer); else setPreference('sidebar', !preferences.sidebar); }} />}<Breadcrumbs nodes={[category, course, ...(volume ? [volume] : [])]} />
      {!volume ? <section className="course-overview"><p className="eyebrow">YOUR NEXT DEEP DIVE</p><h1>{course.title}</h1><p>{course.description}</p>{course.volumes.length ? <a className="primary-button" href={course.volumes[0].url}>Start reading →</a> : <div className="notice">No published volumes yet. Add a Markdown file to this course’s volumes folder.</div>}<DownloadCourse course={course} /><div className="volume-grid">{course.volumes.map(v => <a href={v.url} key={v.id} className="volume-card"><Thumbnail node={v} /><h2>{v.title}</h2><p>{v.decision.effect === 'deny' ? 'Locked in the active policy' : v.description || 'Open volume →'}</p></a>)}</div></section>
      : <div className="reading-layout"><div className="article-column"><header className="volume-header"><div className="chapter-heading"><p className="eyebrow">{rendered.preview ? 'PREVIEW EDITION' : full ? `CONTINUOUS READING · ${full.chapters.length} CHAPTERS` : chapter ? `CHAPTER ${volume.chapters.findIndex(ch => ch.id === chapter.id) + 1} OF ${volume.chapters.length}` : 'THE READING ROOM'} · {rendered.minutes || '—'} MIN READ</p><h1>{chapter?.title || volume.title}</h1></div><div className="volume-actions"><span>{percent}% read{full ? ` · ${chaptersDone} / ${full.chapters.length} chapters complete` : ''}</span>{full ? <a className="mode-button" href={volume.chapters[0].url}>❑ Read chapter by chapter</a> : volume.chapters?.length > 1 ? <a className="mode-button is-primary" href={fullVolumeUrl(volume.url)} title="Read every chapter of this volume on one page">⇊ Read full volume</a> : null}<button className={isComplete(course, readingNode) ? 'complete-button completed' : 'complete-button'} disabled={!ready || !readingNode.progressAllowed} onClick={() => complete(course, readingNode, true)}>{isComplete(course, readingNode) ? '✓ Completed — unmark' : '○ Mark as complete'}</button></div></header>
        {!allowed ? <div className="empty locked"><span>⊘</span><h2>This volume is locked</h2><p>{rendered.decision.reason}</p><p>The active policy withheld the content on the server.</p></div> : <><div ref={article} className="article-region">{full ? full.chapters.map((entry, i) => <section key={entry.id} id={chapterAnchor(entry)} className="chapter-section" aria-labelledby={`${chapterAnchor(entry)}-title`} ref={node => { if (node) sections.current.set(entry.id, node); else sections.current.delete(entry.id); }}>
          <div className="chapter-section-header"><p className="eyebrow">CHAPTER {i + 1} OF {full.chapters.length} · {entry.minutes} MIN{isComplete(course, entry) ? ' · ✓ COMPLETE' : ''}</p><h2 id={`${chapterAnchor(entry)}-title`}>{entry.title}</h2><a className="chapter-section-link" href={entry.url}>Open this chapter on its own page →</a></div>
          <article className={`prose ${entry.repeatedTitle ? 'repeated-chapter-title' : ''}`} dangerouslySetInnerHTML={{ __html: entry.html }} />
        </section>) : <article className={`prose ${rendered.repeatedTitle ? 'repeated-chapter-title' : ''}`} dangerouslySetInnerHTML={{ __html: rendered.html }} />}</div>{rendered.error && <p className="notice" role="alert">{rendered.error}</p>}{rendered.empty && <p className="notice">This volume is empty. Add some Markdown and refresh.</p>}{rendered.preview && <div className="preview-notice"><strong>This is a preview.</strong><p>The remaining content was withheld on the server. Completion is unavailable for previews.</p></div>}</>}
        <nav className="volume-pagination" aria-label={chapter ? 'Adjacent chapters' : 'Adjacent volumes'}>{rendered.previous ? <a href={rendered.previous.url}><span>← PREVIOUS {chapter ? 'CHAPTER' : 'VOLUME'}</span>{rendered.previous.title}</a> : <button disabled>← Previous unavailable</button>}{rendered.next ? <a href={rendered.next.url}><span>NEXT {chapter ? 'CHAPTER' : 'VOLUME'} →</span>{rendered.next.title}</a> : <button disabled>Next unavailable →</button>}</nav>
        {chapter && <nav className="volume-jump" aria-label="Other volumes">{rendered.previousVolume && <a href={rendered.previousVolume.url}>← Previous volume</a>}<a href={course.url}>Course overview</a>{rendered.nextVolume && <a href={rendered.nextVolume.url}>Next volume →</a>}</nav>}
      </div>{showToc && <aside className={`toc ${outlineOpen ? 'outline-expanded' : ''}`}><div className="toc-heading"><p className="eyebrow">{full ? 'CHAPTERS' : 'ON THIS PAGE'}</p><button className="outline-expand" onClick={() => setOutlineOpen(!outlineOpen)} aria-expanded={outlineOpen} aria-label="Toggle section links">{outlineOpen ? '⌃' : '⌄'}</button><button onClick={() => setPreference('toc', false)} aria-label="Hide table of contents" title="Hide table of contents">×</button></div><nav aria-label={full ? 'Chapters' : 'Table of contents'}>{full
        ? full.chapters.map((entry, i) => <div key={entry.id} className="toc-chapter">
          <a className="toc-chapter-link" href={`#${chapterAnchor(entry)}`} aria-current={activeChapter === entry.id ? 'location' : undefined}><span className="toc-chapter-mark">{isComplete(course, entry) ? '✓' : String(i + 1).padStart(2, '0')}</span>{entry.title}</a>
          {activeChapter === entry.id && entry.toc.filter(item => item.text.trim() !== entry.title.trim()).map(item => <a key={item.id} href={`#${item.id}`} aria-current={activeHeading === item.id ? 'location' : undefined} className={item.depth === 3 ? 'subheading' : ''}>{item.text}</a>)}
        </div>)
        : tocItems.map(item => <a key={item.id} href={`#${item.id}`} aria-current={activeHeading === item.id ? 'location' : undefined} className={item.depth === 3 ? 'subheading' : ''}>{item.text}</a>)}</nav><a className="back-to-top" href="#main">↑ Back to top</a></aside>}</div>}
    </div>
  </main>;
}