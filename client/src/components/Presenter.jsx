import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENT_CHANNEL, TRANSITIONS } from '../services/presentChannel.js';

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const IDLE_MS = 2500;
const WAIT_FOR_EDITOR_MS = 2000;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const slideFromHash = () => {
  const n = Number.parseInt(window.location.hash.slice(1), 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : 0;
};

/** Scale factor that fits a 1280x720 slide inside the window. */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / SLIDE_WIDTH, window.innerHeight / SLIDE_HEIGHT));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

function SlideLayer({ slide, theme, number, className, onAnimationEnd }) {
  return (
    <div className={`presenter-layer sc-theme-${theme} ${className}`} onAnimationEnd={onAnimationEnd}>
      <div className={`sc-slide sc-slide--${slide.layout}`}>
        <div className="sc-slide-content" dangerouslySetInnerHTML={{ __html: slide.html }} />
        <div className="sc-slide-number">{number}</div>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ['→  Space  Page Down  Click', 'Next slide'],
  ['←  Page Up  Backspace', 'Previous slide'],
  ['Home / End', 'First / last slide'],
  ['F', 'Full screen'],
  ['N', 'Speaker notes'],
  ['?', 'Show this help'],
];

/**
 * Full-window presenter, opened in its own tab from the editor.
 * Gets the deck from the editor tab and follows its edits live.
 */
export default function Presenter() {
  const [deck, setDeck] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [index, setIndex] = useState(slideFromHash);
  // The slide animating out during a transition, if any.
  const [leaving, setLeaving] = useState(null);
  const [navCount, setNavCount] = useState(0);
  const [transitionOverride, setTransitionOverride] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const scale = useFitScale();
  const touchStart = useRef(null);

  const slides = deck?.slides ?? [];
  const count = slides.length;
  const current = Math.max(0, Math.min(index, count - 1));
  const transition = transitionOverride ?? deck?.transition ?? 'slide';

  // Receive the deck from the editor tab.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      setStatus('unsupported');
      return undefined;
    }
    const channel = new BroadcastChannel(PRESENT_CHANNEL);
    let started = false;
    channel.onmessage = (event) => {
      if (event.data?.type !== 'deck' || !event.data.deck) return;
      setDeck(event.data.deck);
      setStatus('ready');
      if (!started && Number.isInteger(event.data.start) && !window.location.hash) setIndex(event.data.start);
      started = true;
    };
    channel.postMessage({ type: 'request' });
    const timer = setTimeout(() => setStatus((s) => (s === 'waiting' ? 'missing' : s)), WAIT_FOR_EDITOR_MS);
    return () => {
      clearTimeout(timer);
      channel.close();
    };
  }, []);

  useEffect(() => {
    document.title = deck ? `${deck.title} · Presenting` : 'Slidecraft presenter';
  }, [deck]);

  // Keep the slide number in the address bar so a reload returns to the same slide.
  useEffect(() => {
    if (count) window.history.replaceState(null, '', `#${current + 1}`);
  }, [current, count]);

  const goTo = useCallback(
    (target) => {
      if (!count) return;
      const next = Math.max(0, Math.min(target, count - 1));
      if (next === current) return;
      const animate = transition !== 'none' && !prefersReducedMotion();
      setLeaving(animate ? { index: current, direction: next > current ? 'forward' : 'back' } : null);
      setIndex(next);
      setNavCount((n) => n + 1);
    },
    [count, current, transition],
  );

  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const previous = useCallback(() => goTo(current - 1), [goTo, current]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('select, input')) return;
      const key = event.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) next();
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) previous();
      else if (key === 'Home') goTo(0);
      else if (key === 'End') goTo(count - 1);
      else if (key === 'f' || key === 'F') toggleFullscreen();
      else if (key === 'n' || key === 'N') setShowNotes((v) => !v);
      else if (key === '?') setShowHelp((v) => !v);
      else if (key === 'Escape') setShowHelp(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, previous, goTo, count, toggleFullscreen]);

  // Hide the toolbar and cursor when the mouse is still.
  useEffect(() => {
    let timer;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  const handleStageClick = (event) => {
    if (event.target.closest('a')) return;
    // Clicking the left quarter goes back, anywhere else goes forward.
    if (event.clientX < window.innerWidth / 4) previous();
    else next();
  };

  const handleTouchStart = (event) => {
    touchStart.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStart.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else previous();
    }
  };

  if (status !== 'ready' || !count) {
    const message = {
      waiting: 'Connecting to the editor…',
      missing: 'This presenter gets its slides from the Slidecraft editor. Open the editor and click Present.',
      unsupported: 'This browser cannot connect the presenter to the editor. Try a current version of Chrome, Edge, Firefox or Safari.',
      ready: 'There are no slides to present yet. Add some content in the editor.',
    }[status];
    return (
      <div className="presenter presenter--empty">
        <div className="presenter-message">
          {status === 'waiting' && <span className="spinner" aria-hidden="true" />}
          <p>{message}</p>
          {status === 'missing' && (
            <a className="btn btn-primary" href={window.location.pathname}>
              Open the editor
            </a>
          )}
        </div>
      </div>
    );
  }

  const slide = slides[current];
  const leavingSlide = leaving && slides[leaving.index];
  const direction = leaving?.direction ?? 'forward';
  const frameStyle = { transform: `translate(-50%, -50%) scale(${scale})` };

  return (
    <div
      className={`presenter ${idle && !showHelp ? 'is-idle' : ''} presenter--${transition}`}
      onClick={handleStageClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="presenter-frame" style={frameStyle}>
        {leavingSlide && (
          <SlideLayer
            key={`leave-${navCount}`}
            slide={leavingSlide}
            theme={deck.theme}
            number={leaving.index + 1}
            className={`is-leaving is-${direction}`}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) setLeaving(null);
            }}
          />
        )}
        <SlideLayer
          key={`slide-${navCount}`}
          slide={slide}
          theme={deck.theme}
          number={current + 1}
          className={`is-current is-${direction} ${navCount > 0 && leavingSlide ? 'is-entering' : ''} ${prefersReducedMotion() ? '' : 'presenter-build'}`}
        />
      </div>

      <div className="presenter-progress" aria-hidden="true">
        <span style={{ width: `${((current + 1) / count) * 100}%` }} />
      </div>

      {showNotes && (
        <aside className="presenter-notes" onClick={(e) => e.stopPropagation()}>
          <strong>Notes</strong>
          <p>{slide.notes || 'No speaker notes for this slide.'}</p>
        </aside>
      )}

      {showHelp && (
        <div className="presenter-help" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
          <h2>Keyboard shortcuts</h2>
          <dl>
            {SHORTCUTS.map(([keys, action]) => (
              <div key={action}>
                <dt>{keys}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowHelp(false)}>
            Close
          </button>
        </div>
      )}

      <div className="presenter-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="presenter-btn" onClick={previous} disabled={current === 0} aria-label="Previous slide">
          ‹
        </button>
        <span className="presenter-count">
          {current + 1} / {count}
        </span>
        <button type="button" className="presenter-btn" onClick={next} disabled={current === count - 1} aria-label="Next slide">
          ›
        </button>
        <span className="presenter-divider" />
        <label className="presenter-select">
          <span className="visually-hidden">Transition</span>
          <select value={transition} onChange={(e) => setTransitionOverride(e.target.value)}>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={`presenter-btn presenter-btn--text ${showNotes ? 'is-on' : ''}`} onClick={() => setShowNotes((v) => !v)}>
          Notes
        </button>
        <button type="button" className="presenter-btn presenter-btn--text" onClick={toggleFullscreen}>
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
        <button type="button" className="presenter-btn" onClick={() => setShowHelp((v) => !v)} aria-label="Keyboard shortcuts">
          ?
        </button>
      </div>
    </div>
  );
}
