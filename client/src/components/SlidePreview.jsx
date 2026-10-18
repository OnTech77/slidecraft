import ScaledSlide from './ScaledSlide.jsx';

/** Large view of the current slide, its speaker notes and a strip of thumbnails. */
export default function SlidePreview({ slides, theme, current, onSelect, onPresent, loading, error }) {
  const count = slides.length;

  const handleKeyDown = (event) => {
    if (event.target.closest('a')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      onSelect(Math.min(current + 1, count - 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      onSelect(Math.max(current - 1, 0));
    }
  };

  if (count === 0) {
    return (
      <section className="preview preview--empty" aria-label="Slide preview">
        <div className="empty-state">
          <div className="empty-state-art" aria-hidden="true" />
          <h2>Your slides will appear here</h2>
          <p>Start typing Markdown, upload a .md file or load the sample deck. Separate slides with a line containing only <code>---</code>.</p>
          {error && <p className="preview-error" role="alert">{error}</p>}
        </div>
      </section>
    );
  }

  const slide = slides[current];

  return (
    <section className="preview" aria-label="Slide preview" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="preview-toolbar">
        <div className="preview-position">
          Slide <strong>{current + 1}</strong> of {count}
          {loading && <span className="preview-updating">Updating…</span>}
        </div>
        <div className="button-group">
          <button type="button" className="btn btn-primary btn-sm" onClick={onPresent} title="Present in a new tab">
            ▶ Present
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => onSelect(current - 1)} disabled={current === 0} aria-label="Previous slide">
            ‹
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => onSelect(current + 1)} disabled={current === count - 1} aria-label="Next slide">
            ›
          </button>
        </div>
      </div>

      {error && <p className="preview-error" role="alert">{error}</p>}

      <ScaledSlide slide={slide} theme={theme} number={current + 1} className="preview-stage" />

      <div className="preview-notes">
        <span className="label">Speaker notes</span>
        <p>{slide.notes || <span className="muted">No notes for this slide. Add a line starting with “Note:” at the end of the slide.</span>}</p>
      </div>

      <ol className="thumbnails" aria-label="All slides">
        {slides.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`thumbnail ${i === current ? 'is-active' : ''}`}
              onClick={() => onSelect(i)}
              aria-label={`Slide ${i + 1}${s.title ? `: ${s.title}` : ''}`}
              aria-current={i === current ? 'true' : undefined}
            >
              <ScaledSlide slide={s} theme={theme} />
              <span className="thumbnail-number">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
