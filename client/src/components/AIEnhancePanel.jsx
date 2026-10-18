import { useEffect, useRef, useState } from 'react';
import { api, isAbortError } from '../services/api.js';
import Alert from './Alert.jsx';

const MAX_AI_CHARS = 30_000;
const PROVIDER_KEY = 'slidecraft.aiProvider';

const savedProvider = () => {
  try {
    return localStorage.getItem(PROVIDER_KEY);
  } catch {
    return null;
  }
};

const saveProvider = (id) => {
  try {
    localStorage.setItem(PROVIDER_KEY, id);
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
};

/**
 * Choose an AI action, run it, then review a before/after comparison.
 * Nothing changes in the editor until the user clicks "Apply changes".
 */
export default function AIEnhancePanel({ aiStatus, markdown, onApply, onError, canUndo, onUndo, onRefreshStatus }) {
  const [action, setAction] = useState('improve');
  const [providerChoice, setProviderChoice] = useState(savedProvider);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const controllerRef = useRef(null);

  // Cancel an in-flight request if the panel is closed.
  useEffect(() => () => controllerRef.current?.abort(), []);

  // Check the providers again each time the step opens (Ollama may have been started since).
  useEffect(() => {
    onRefreshStatus?.();
  }, [onRefreshStatus]);

  if (!aiStatus) {
    return <p className="muted">Checking AI availability…</p>;
  }

  const providers = aiStatus.providers ?? [];
  const provider =
    providers.find((p) => p.id === providerChoice) ?? providers.find((p) => p.id === aiStatus.defaultProvider) ?? providers[0] ?? null;
  const configured = Boolean(provider?.available);
  const local = provider?.id === 'ollama';

  const chooseProvider = (id) => {
    setProviderChoice(id);
    saveProvider(id);
  };

  const checkAgain = async () => {
    setChecking(true);
    try {
      await onRefreshStatus?.();
    } finally {
      setChecking(false);
    }
  };
  const empty = markdown.trim() === '';
  const tooLong = markdown.length > MAX_AI_CHARS;

  const run = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setResult(null);
    try {
      const response = await api.enhance(markdown, action, { provider: provider?.id, signal: controller.signal });
      setResult({ before: markdown, after: response.markdown, action, model: response.model });
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
          Review the <strong>{actionLabel(result.action)}</strong> result from {result.model} below. Your slides only change when you apply
          it.
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
      <div className="field">
        <label htmlFor="ai-provider" className="label">
          AI model
        </label>
        <select
          id="ai-provider"
          className="input"
          value={provider?.id ?? ''}
          onChange={(e) => chooseProvider(e.target.value)}
          disabled={loading || providers.length === 0}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.model}
              {p.available ? '' : ' (not available)'}
            </option>
          ))}
        </select>
        {provider && <span className="muted field-hint">{provider.description}</span>}
      </div>

      {provider && !configured && (
        <Alert type="warning">
          <span className="ai-unavailable">
            {provider.label} is not available. {provider.reason}
            <button type="button" className="btn btn-secondary btn-sm" onClick={checkAgain} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          </span>
        </Alert>
      )}
      {!provider && <Alert type="warning">Could not check which AI models are available. Make sure the server is running.</Alert>}
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
              <span className="spinner" aria-hidden="true" /> {local ? 'Running on this computer…' : 'Enhancing…'}
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
      {loading && local && <p className="muted ai-model">Local models can take a minute or two, especially the first time they load.</p>}
    </div>
  );
}
