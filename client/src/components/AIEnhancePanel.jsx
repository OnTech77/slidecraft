import { useEffect, useRef, useState } from 'react';
import { api, isAbortError } from '../services/api.js';
import Alert from './Alert.jsx';

const MAX_AI_CHARS = 30_000;

/**
 * Choose an AI action, run it, then review a before/after comparison.
 * Nothing changes in the editor until the user clicks "Apply changes".
 */
export default function AIEnhancePanel({ aiStatus, markdown, onApply, onError, canUndo, onUndo }) {
  const [action, setAction] = useState('improve');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const controllerRef = useRef(null);

  // Cancel an in-flight request if the panel is closed.
  useEffect(() => () => controllerRef.current?.abort(), []);

  if (!aiStatus) {
    return <p className="muted">Checking AI availability…</p>;
  }

  const configured = aiStatus.configured;
  const empty = markdown.trim() === '';
  const tooLong = markdown.length > MAX_AI_CHARS;

  const run = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setResult(null);
    try {
      const response = await api.enhance(markdown, action, { signal: controller.signal });
      setResult({ before: markdown, after: response.markdown, action });
    } catch (err) {
      if (!isAbortError(err)) onError(err.message);
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const actionLabel = (id) => aiStatus.actions.find((a) => a.id === id)?.label ?? id;

  if (result) {
    const unchanged = result.before === result.after;
    return (
      <div className="ai-result">
        <Alert type="info">
          Review the <strong>{actionLabel(result.action)}</strong> result below. Your slides only change when you apply it.
        </Alert>
        {unchanged && <Alert type="warning">The AI did not suggest any changes.</Alert>}
        {result.before !== markdown && (
          <Alert type="warning">You edited your Markdown while the AI was working. Applying will replace those edits.</Alert>
        )}
        <div className="compare">
          <div className="compare-column">
            <span className="label">Before</span>
            <pre className="compare-text">{result.before}</pre>
          </div>
          <div className="compare-column">
            <span className="label">After</span>
            <pre className="compare-text compare-text--after">{result.after}</pre>
          </div>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="btn btn-primary"
            disabled={unchanged}
            onClick={() => {
              onApply(result.after);
              setResult(null);
            }}
          >
            Apply changes
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      {!configured && (
        <Alert type="warning">
          AI enhancements are turned off. To enable them, add your <code>OPENAI_API_KEY</code> to <code>server/.env</code> and restart the
          server.
        </Alert>
      )}
      {configured && empty && <Alert type="info">Add some Markdown content first, then come back to enhance it.</Alert>}
      {configured && tooLong && (
        <Alert type="warning">
          Your deck is longer than {MAX_AI_CHARS.toLocaleString()} characters, which is the limit for AI enhancement. Try a shorter deck.
        </Alert>
      )}

      <fieldset className="ai-actions" disabled={!configured || loading}>
        <legend className="label">What should the AI do?</legend>
        {aiStatus.actions.map((a) => (
          <label key={a.id} className={`ai-action ${action === a.id ? 'is-active' : ''}`}>
            <input type="radio" name="ai-action" value={a.id} checked={action === a.id} onChange={() => setAction(a.id)} />
            <span>
              <strong>{a.label}</strong>
              <span className="muted">{a.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="button-group">
        <button type="button" className="btn btn-primary" onClick={run} disabled={!configured || empty || tooLong || loading}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" /> Enhancing…
            </>
          ) : (
            `✨ ${actionLabel(action)}`
          )}
        </button>
        {loading && (
          <button type="button" className="btn btn-ghost" onClick={() => controllerRef.current?.abort()}>
            Cancel
          </button>
        )}
        {canUndo && !loading && (
          <button type="button" className="btn btn-ghost" onClick={onUndo}>
            Undo last AI change
          </button>
        )}
      </div>
      {configured && aiStatus.model && <p className="muted ai-model">Using model {aiStatus.model}</p>}
    </div>
  );
}
