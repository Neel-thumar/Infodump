'use client';
import { useEffect, useRef, useState } from 'react';

export default function FocusMode({ article }) {
  const [focused, setFocused] = useState(false);
  const button = useRef(null), active = useRef(false), ownsFullscreen = useRef(false), frame = useRef(null);

  function changeFocus(next) {
    const element = article.current;
    const top = element ? element.getBoundingClientRect().top + window.scrollY : 0;
    const ratio = element ? Math.max(0, (window.scrollY - top) / Math.max(1, element.offsetHeight)) : 0;
    active.current = next;
    document.body.toggleAttribute('data-reading-focus', next);
    setFocused(next);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (element) window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + ratio * element.offsetHeight);
      button.current?.focus({ preventScroll: true });
    });
  }

  async function toggle() {
    if (active.current) {
      changeFocus(false);
      if (ownsFullscreen.current && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch { /* Layout has already been restored. */ }
      }
      ownsFullscreen.current = false;
    } else {
      changeFocus(true);
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        try { await document.documentElement.requestFullscreen(); ownsFullscreen.current = true; }
        catch { /* Mobile/embedded browsers may deny fullscreen; distraction-free layout still works. */ }
      }
    }
  }

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement && ownsFullscreen.current) {
        ownsFullscreen.current = false;
        if (active.current) changeFocus(false);
      }
    };
    const onKey = event => {
      if (event.key === 'Escape' && active.current) {
        changeFocus(false);
        if (ownsFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        ownsFullscreen.current = false;
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame.current);
      document.body.removeAttribute('data-reading-focus');
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
      if (ownsFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // This component is keyed by volume; listeners and page-wide layout state are cleaned up on departure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <button ref={button} className={`focus-toggle ${focused ? 'is-focused' : ''}`} onClick={toggle}
    aria-label={focused ? 'Exit focus mode' : 'Enter focus mode'} aria-pressed={focused}
    title={focused ? 'Exit focus mode (Esc)' : 'Focus mode — read fullscreen'}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={focused ? 'M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5' : 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5'} />
    </svg>
  </button>;
}