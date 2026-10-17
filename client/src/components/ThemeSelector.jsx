import ScaledSlide from './ScaledSlide.jsx';

/** Grid of theme cards. Each card previews the deck's first slide in that theme. */
export default function ThemeSelector({ themes, selected, onSelect, previewSlide }) {
  if (themes.length === 0) {
    return <p className="muted">Loading themes…</p>;
  }

  return (
    <div className="theme-grid" role="radiogroup" aria-label="Theme">
      {themes.map((theme) => {
        const active = theme.id === selected;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-card ${active ? 'is-active' : ''}`}
            onClick={() => onSelect(theme.id)}
          >
            {previewSlide ? (
              <ScaledSlide slide={previewSlide} theme={theme.id} />
            ) : (
              <div className="theme-swatch" style={{ background: theme.colors.bg }}>
                <span style={{ background: theme.colors.fg }} />
                <span style={{ background: theme.colors.accent }} />
              </div>
            )}
            <span className="theme-card-text">
              <strong>{theme.name}</strong>
              <span className="muted">{theme.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
