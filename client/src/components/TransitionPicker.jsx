import { TRANSITIONS } from '../services/presentChannel.js';

/** Choose the slide transition used when presenting. */
export default function TransitionPicker({ selected, onSelect }) {
  const current = TRANSITIONS.find((t) => t.id === selected) ?? TRANSITIONS[0];
  return (
    <div className="transition-picker">
      <span className="label" id="transition-label">
        Transition when presenting
      </span>
      <div className="transition-options" role="radiogroup" aria-labelledby="transition-label">
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === current.id}
            className={`transition-option ${t.id === current.id ? 'is-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className="muted field-hint">
        {current.description} You can also set it in your Markdown front matter with <code>transition: {current.id}</code>.
      </span>
    </div>
  );
}
