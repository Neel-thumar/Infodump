'use client';
import { useEffect, useRef, useState } from 'react';
import { useReading } from './ClientState.js';
import { positionKey, statePrefix } from '../lib/state.js';
import { Breadcrumbs, Progress, Thumbnail, Warnings } from './Catalog.js';
import FocusMode from './FocusMode.js';
import ReaderControls, { useReaderPreferences } from './ReaderControls.js';

export default function Reader({ category, course, volume, rendered, warnings }) {
  const reading = useReading(), { viewer, values, save, complete, isComplete, ready } = reading;
  const [drawer, setDrawer] = useState(false), [percent, setPercent] = useState(0);
  const article = useRef(null), sidebar = useRef(null), menuButton = useRef(null), latest = useRef(reading);
  latest.current = reading;
  const allowed = rendered?.decision.effect !== 'deny';
  const chapter = rendered?.chapter, readingNode = chapter || volume;
  const { preferences, setPreference, reset } = useReaderPreferences();
  const [activeHeading, setActiveHeading] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(false);
  useEffect(() => {
    document.body.toggleAttribute('data-reader-header-hidden', !preferences.header);
    return () => document.body.removeAttribute('data-reader-header-hidden');
  }, [preferences.header]);
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

  return <main id="main" className={`reader-shell ${!preferences.sidebar ? 'hide-sidebar' : ''} ${!preferences.toc ? 'hide-toc' : ''} ${!preferences.breadcrumbs ? 'hide-breadcrumbs' : ''} ${!preferences.title ? 'hide-title' : ''} ${!preferences.progress ? 'hide-progress' : ''} ${!preferences.footer ? 'hide-footer' : ''} ${!preferences.toolbar ? 'hide-toolbar' : ''} measure-${preferences.width}`} style={{ '--reader-font-size': `${preferences.fontSize}px` }}>
    {!preferences.toolbar && <button className="restore-reader-controls" aria-label="Show reading controls" title="Show reading controls" onClick={() => setPreference('toolbar', true)}>⚙</button>}
    {volume && allowed && rendered.html && <FocusMode key={readingNode.id} article={article} />}
    <div className="reading-meter" style={{ width: `${percent}%` }} />
    <button ref={menuButton} className="drawer-toggle" aria-expanded={drawer} aria-controls="volume-sidebar" onClick={() => setDrawer(!drawer)}>☰ Volumes</button>
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
    <div className="reader-content"><ReaderControls volume={volume} chapter={chapter} rendered={rendered} preferences={preferences} setPreference={setPreference} reset={reset} onMenu={() => { if (matchMedia('(max-width: 700px)').matches) setDrawer(!drawer); else setPreference('sidebar', !preferences.sidebar); }} /><Breadcrumbs nodes={[category, course, ...(volume ? [volume] : []), ...(chapter ? [chapter] : [])]} /><Warnings warnings={warnings} />
      {!volume ? <section className="course-overview"><p className="eyebrow">YOUR NEXT DEEP DIVE</p><h1>{course.title}</h1><p>{course.description}</p>{course.volumes.length ? <a className="primary-button" href={course.volumes[0].url}>Start reading →</a> : <div className="notice">No published volumes yet. Add a Markdown file to this course’s volumes folder.</div>}<div className="volume-grid">{course.volumes.map(v => <a href={v.url} key={v.id} className="volume-card"><Thumbnail node={v} /><h2>{v.title}</h2><p>{v.decision.effect === 'deny' ? 'Locked in the active policy' : v.description || 'Open volume →'}</p></a>)}</div></section>
      : <div className="reading-layout"><div className="article-column"><header className="volume-header"><div className="chapter-heading"><p className="eyebrow">{rendered.preview ? 'PREVIEW EDITION' : chapter ? `CHAPTER ${volume.chapters.findIndex(ch => ch.id === chapter.id) + 1} OF ${volume.chapters.length}` : 'THE READING ROOM'} · {rendered.minutes || '—'} MIN READ</p><h1>{chapter?.title || volume.title}</h1></div><div className="volume-actions"><span>{percent}% read</span><button className={isComplete(course, readingNode) ? 'complete-button completed' : 'complete-button'} disabled={!ready || !readingNode.progressAllowed} onClick={() => complete(course, readingNode, true)}>{isComplete(course, readingNode) ? '✓ Completed — unmark' : '○ Mark as complete'}</button></div></header>
        {!allowed ? <div className="empty locked"><span>⊘</span><h2>This volume is locked</h2><p>{rendered.decision.reason}</p><p>The active policy withheld the content on the server.</p></div> : <><div ref={article} className="article-region"><article className={`prose ${rendered.repeatedTitle ? 'repeated-chapter-title' : ''}`} dangerouslySetInnerHTML={{ __html: rendered.html }} /></div>{rendered.error && <p className="notice" role="alert">{rendered.error}</p>}{rendered.empty && <p className="notice">This volume is empty. Add some Markdown and refresh.</p>}{rendered.preview && <div className="preview-notice"><strong>This is a preview.</strong><p>The remaining content was withheld on the server. Completion is unavailable for previews.</p></div>}</>}
        <nav className="volume-pagination" aria-label={chapter ? 'Adjacent chapters' : 'Adjacent volumes'}>{rendered.previous ? <a href={rendered.previous.url}><span>← PREVIOUS {chapter ? 'CHAPTER' : 'VOLUME'}</span>{rendered.previous.title}</a> : <button disabled>← Previous unavailable</button>}{rendered.next ? <a href={rendered.next.url}><span>NEXT {chapter ? 'CHAPTER' : 'VOLUME'} →</span>{rendered.next.title}</a> : <button disabled>Next unavailable →</button>}</nav>
        {chapter && <nav className="volume-jump" aria-label="Other volumes">{rendered.previousVolume && <a href={rendered.previousVolume.url}>← Previous volume</a>}<a href={course.url}>Course overview</a>{rendered.nextVolume && <a href={rendered.nextVolume.url}>Next volume →</a>}</nav>}
      </div><aside className={`toc ${outlineOpen ? 'outline-expanded' : ''}`}><div className="toc-heading"><p className="eyebrow">ON THIS PAGE</p><button className="outline-expand" onClick={() => setOutlineOpen(!outlineOpen)} aria-expanded={outlineOpen} aria-label="Toggle section links">{outlineOpen ? '⌃' : '⌄'}</button><button onClick={() => setPreference('toc', false)} aria-label="Hide table of contents" title="Hide table of contents">×</button></div><nav aria-label="Table of contents">{rendered.toc.map(item => <a key={item.id} href={`#${item.id}`} aria-current={activeHeading === item.id ? 'location' : undefined} className={item.depth === 3 ? 'subheading' : ''}>{item.text}</a>)}</nav><a className="back-to-top" href="#main">↑ Back to top</a></aside></div>}
    </div>
  </main>;
}