'use client';
import { useEffect, useState } from 'react';
import { useReading } from './ClientState.js';
import { statePrefix } from '../lib/state.js';

export function Thumbnail({ node, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [node.thumbnail?.url]);
  if (failed || !node.thumbnail) {
    let hash = 0; for (const char of node.id) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return <div className={`thumb fallback ${className}`} style={{ background: `hsl(${hash % 360},35%,25%)` }} aria-label={node.title}>{node.title.split(' ').slice(0, 2).map(w => w[0]).join('')}</div>;
  }
  return <img className={`thumb ${className}`} src={node.thumbnail.url} alt="" loading="lazy" data-origin={node.thumbnail.origin} onError={() => setFailed(true)} />;
}
export function Progress({ courses }) {
  const { isComplete, ready } = useReading();
  const total = courses.reduce((n, c) => n + c.volumes.length, 0);
  const done = courses.reduce((n, c) => n + c.volumes.filter(v => isComplete(c, v)).length, 0);
  const percent = total ? Math.round(done / total * 100) : 0;
  return <div className="progress"><div className="progress-label"><span>{ready ? `${done} / ${total} volumes complete` : `${total} volumes`}</span><span>{ready ? percent : 0}%</span></div><div role="progressbar" aria-label="Reading completion" aria-valuenow={ready ? percent : 0} aria-valuemin={0} aria-valuemax={100} className="progress-track"><span style={{ width: `${ready ? percent : 0}%` }} /></div></div>;
}
export function Breadcrumbs({ nodes = [] }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a>{nodes.map((node, i) => <span key={node.url}> <span aria-hidden="true">/</span> {i === nodes.length - 1 ? <span aria-current="page">{node.title}</span> : <a href={node.url}>{node.title}</a>}</span>)}</nav>;
}
export function Warnings({ warnings }) {
  return warnings.length ? <details className="notice"><summary>{warnings.length} content notice{warnings.length === 1 ? '' : 's'}</summary><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></details> : null;
}
export function Catalog({ library, categorySlug, all = false }) {
  const { values, viewer } = useReading();
  const [query, setQuery] = useState(''), [remote, setRemote] = useState(null), [error, setError] = useState('');
  const category = library.categories.find(c => c.slug === categorySlug);
  const courses = library.categories.flatMap(c => c.courses);
  const nodes = category ? category.courses : all ? courses : library.categories;
  const q = query.trim().toLocaleLowerCase();
  const filtered = nodes.filter(n => `${n.title} ${n.description}`.toLocaleLowerCase().includes(q));
  useEffect(() => {
    setRemote(null); setError('');
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Search unavailable. Try again.');
        setRemote(await response.json());
      } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);
  const last = values[`${statePrefix(viewer.id)}last`];
  let continuation;
  for (const cat of library.categories) for (const course of cat.courses) {
    const volume = course.volumes.find(v => v.id === last?.volumeId && v.decision.effect !== 'deny');
    if (volume) continuation = { cat, course, volume, chapter: volume.chapters?.find(ch => ch.id === last?.chapterId) };
  }
  const volumeCount = courses.reduce((n, c) => n + c.volumes.length, 0);
  return <main id="main" className="catalog shell">
    {category && <Breadcrumbs nodes={[category]} />}
    <div className="hero"><p className="eyebrow">{category ? 'EXPLORE THE COLLECTION' : 'A LITTLE KNOWLEDGE, EVERY DAY'}</p><h1>{category ? category.title : all ? 'Every course. One place.' : <>Your next chapter<br />starts here<span className="accent">.</span></>}</h1>
      <p className="hero-description">{category ? category.description : 'Deep technical reading, at your own pace. Pick up a course, follow your curiosity, and make it yours.'}</p>
      <div className="library-stats"><span><strong>{library.categories.length}</strong> collections</span><span><strong>{courses.length}</strong> courses</span><span><strong>{volumeCount}</strong> volumes</span><span className="local-badge">● Local & private</span></div>
    </div>
    {continuation && <a className="continue-card" href={continuation.chapter?.url || continuation.volume.url}><span className="continue-icon">↗</span><div><span className="eyebrow">CONTINUE WHERE YOU LEFT OFF</span><h2>{continuation.chapter?.title || continuation.volume.title}</h2><p>{continuation.cat.title} → {continuation.course.title} → {continuation.volume.title}{continuation.chapter && ` → ${continuation.chapter.title}`}</p></div><span className="continue-arrow">→</span></a>}
    <div className="section-heading"><div><p className="eyebrow">THE LIBRARY</p><h2>{category ? 'Courses in this collection' : all ? 'All courses' : 'Explore collections'} <span>{nodes.length.toString().padStart(2, '0')}</span></h2></div>
      <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search library" placeholder="Search courses, topics, anything…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>/</kbd></label>
    </div>
    {category && <div className="category-progress"><Progress courses={category.courses} /></div>}
    <Warnings warnings={library.warnings} />
    {!nodes.length && <div className="empty"><span>◇</span><h2>{category ? 'A new collection, ready to grow.' : 'Your library is ready for its first chapter.'}</h2><p>{category ? 'Add a course folder with a volumes folder to this category, then refresh.' : 'Add content → category → course → volumes with Markdown files, then refresh. No restart needed.'}</p></div>}
    {!!nodes.length && !filtered.length && <p className="notice">No matching {category || all ? 'courses' : 'collections'}. {q.length >= 2 ? 'See full-library search below.' : 'Try another search.'}</p>}
    <div className="card-grid">{filtered.map((node, i) => <a className="library-card" href={node.url} key={node.id}>
      <div className="card-image"><Thumbnail node={node} /><span className="image-label">{node.type === 'category' ? 'COLLECTION' : 'COURSE'} {String(i + 1).padStart(2, '0')}</span><span className="image-arrow">↗</span></div>
      <div className="card-body"><p className="card-meta">{node.courses ? `${node.courses.length} courses · ${node.courses.reduce((n, c) => n + c.volumes.length, 0)} volumes` : `${node.volumes.length} volumes · Self-paced`}</p><h3>{node.title}</h3><p className="card-description">{node.description}</p>{node.courses?.length === 0 && <p className="muted">No courses yet. Room for something good.</p>}<Progress courses={node.courses || [node]} /></div>
    </a>)}</div>
    {q.length >= 2 && <section className="search-results" aria-live="polite"><h2>Across the library</h2>{error ? <p role="alert">{error}</p> : !remote ? <p>Searching volume titles and content…</p> : !remote.results.length ? <div className="empty"><h3>No results for “{query}”</h3><p>Try a shorter phrase or another technical term.</p></div> : remote.results.map(result => <a className="search-result" key={result.url} href={result.url}><span className="eyebrow">{result.kind}</span><h3>{result.title}</h3><p className="result-path">{result.path}</p><p>{result.snippet}</p></a>)}{remote?.truncated && <p>Showing the first 40 results. Narrow your search.</p>}</section>}
    <footer className="library-footer"><span>Made for slow reading and deep understanding.</span><span>Markdown in. Knowledge out.</span></footer>
  </main>;
}