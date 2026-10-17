/** Numbered step navigation. Steps can be visited in any order. */
export default function Stepper({ steps, current, onChange }) {
  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <nav className="stepper" aria-label="Steps">
      <ol>
        {steps.map((step, i) => {
          const state = i === currentIndex ? 'is-current' : i < currentIndex ? 'is-done' : '';
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`step ${state}`}
                onClick={() => onChange(step.id)}
                aria-current={i === currentIndex ? 'step' : undefined}
              >
                <span className="step-number">{i < currentIndex ? '✓' : i + 1}</span>
                <span className="step-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
