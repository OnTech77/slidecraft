import { useEffect, useRef, useState } from 'react';
import { api, isAbortError } from '../services/api.js';
import Alert from './Alert.jsx';

const MAX_AI_CHARS = 30_000;
const MAX_REQUEST_CHARS = 1000;
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
 * The slides as written in the Markdown. A long slide shows as several preview slides
 * that share one `source`; it is listed once, with the range of preview numbers it covers.
 */
function sourceSlides(slides) {
  const list = [];
  for (const slide of slides) {
    const last = list.at(-1);
    if (last?.source === slide.source) last.lastNumber = slide.index + 1;
    else list.push({ source: slide.source, title: slide.title, firstIndex: slide.index, firstNumber: slide.index + 1, lastNumber: slide.index + 1 });
  }
  return list;
}

const slideLabel = (s) =>
  `${s.firstNumber === s.lastNumber ? `Slide ${s.firstNumber}` : `Slides ${s.firstNumber}–${s.lastNumber}`}: ${s.title || 'Untitled'}`;

/**
 * Choose an AI action for the whole deck or one slide, run it, then review a before/after comparison.
 * Nothing changes in the editor until the user clicks "Apply changes".
 * The chosen slide is the one shown in the preview, so picking a slide here also moves the preview.
 */
export default function AIEnhancePanel({
  aiStatus,
  markdown,
  slides = [],
  currentSlide = 0,
  onSelectSlide,
  onApply,
  onError,
  canUndo,
  onUndo,
  onRefreshStatus,
}) {
  const [action, setAction] = useState('improve');
  const [scope, setScope] = useState('deck');
  const [request, setRequest] = useState('');
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

  const perSlide = scope === 'slide';
  const sources = sourceSlides(slides);
  const selected = sources.find((s) => s.source === slides[currentSlide]?.source) ?? sources[0] ?? null;
  const actions = aiStatus.actions.map((a) =>
    perSlide ? { ...a, label: a.slideLabel ?? a.label, description: a.slideDescription ?? a.description } : a,
  );
  const chosen = actions.find((a) => a.id === action) ?? actions[0];
  const needsRequest = Boolean(chosen?.custom);

  const empty = markdown.trim() === '';
  const tooLong = !perSlide && markdown.length > MAX_AI_CHARS;
  const missingSlide = perSlide && !selected;
  const missingRequest = needsRequest && request.trim() === '';

  const run = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setResult(null);
    try {
      const response = await api.enhance(markdown, action, {
        provider: provider?.id,
        slide: perSlide ? selected.source : undefined,
        instruction: needsRequest ? request.trim() : undefined,
        signal: controller.signal,
      });
      setResult({
        before: markdown,
        after: response.markdown,
        label: chosen.label,
        model: response.model,
        slide: response.slide && { ...response.slide, name: slideLabel(selected) },
      });
    } catch (err) {
      if (!isAbortError(err)) onError(err.message);
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  if (result) {
    const unchanged = result.before === result.after;
    // For one slide, compare just that slide; the rest of the deck is unchanged.
    const before = result.slide ? result.slide.before : result.before;
    const after = result.slide ? result.slide.after : result.after;
    return (
      <div className="ai-result">
        <Alert type="info">
          Review the <strong>{result.label}</strong> result from {result.model}
          {result.slide ? (
            <>
              {' '}
              for <strong>{result.slide.name}</strong>. Only this slide changes
            </>
          ) : (
            '. Your slides only change'
          )}{' '}
          when you apply it.
        </Alert>
        {unchanged && <Alert type="warning">The AI did not suggest any changes.</Alert>}
        {result.before !== markdown && (
          <Alert type="warning">You edited your Markdown while the AI was working. Applying will replace those edits.</Alert>
        )}
        <div className="compare">
          <div className="compare-column">
            <span className="label">Before</span>
            <pre className="compare-text">{before}</pre>
          </div>
          <div className="compare-column">
            <span className="label">After</span>
            <pre className="compare-text compare-text--after">{after}</pre>
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

      <div className="field">
        <span className="label" id="ai-scope-label">
          Enhance
        </span>
        <div className="transition-options scope-options" role="radiogroup" aria-labelledby="ai-scope-label">
          {[
            ['deck', 'Whole deck'],
            ['slide', 'One slide'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={scope === id}
              className={`transition-option ${scope === id ? 'is-active' : ''}`}
              onClick={() => setScope(id)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {perSlide && (
        <div className="field">
          <label htmlFor="ai-slide" className="label">
            Slide
          </label>
          <select
            id="ai-slide"
            className="input"
            value={selected?.source ?? ''}
            onChange={(e) => {
              const pick = sources.find((s) => s.source === Number(e.target.value));
              if (pick) onSelectSlide?.(pick.firstIndex);
            }}
            disabled={loading || sources.length === 0}
          >
            {sources.map((s) => (
              <option key={s.source} value={s.source}>
                {slideLabel(s)}
              </option>
            ))}
          </select>
          <span className="muted field-hint">
            {sources.length === 0 ? 'Add some slides first.' : 'You can also pick a slide by clicking it in the preview. Other slides are not changed.'}
          </span>
        </div>
      )}

      <fieldset className="ai-actions" disabled={!configured || loading}>
        <legend className="label">What should the AI do?</legend>
        {actions.map((a) => (
          <label key={a.id} className={`ai-action ${action === a.id ? 'is-active' : ''}`}>
            <input type="radio" name="ai-action" value={a.id} checked={action === a.id} onChange={() => setAction(a.id)} />
            <span>
              <strong>{a.label}</strong>
              <span className="muted">{a.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {needsRequest && (
        <div className="field">
          <label htmlFor="ai-request" className="label">
            {perSlide ? 'What does this slide need?' : 'What should change?'}
          </label>
          <textarea
            id="ai-request"
            className="input ai-request"
            rows={3}
            maxLength={MAX_REQUEST_CHARS}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={
              perSlide ? 'For example: add a real-world example, turn the bullets into a table, or make it friendlier.' : 'For example: make the tone more formal.'
            }
            disabled={!configured || loading}
          />
        </div>
      )}

      <div className="button-group">
        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={!configured || empty || tooLong || missingSlide || missingRequest || loading}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" /> {local ? 'Running on this computer…' : 'Enhancing…'}
            </>
          ) : (
            `✨ ${chosen?.label ?? 'Enhance'}${perSlide && selected ? ` · ${selected.firstNumber === selected.lastNumber ? `slide ${selected.firstNumber}` : `slides ${selected.firstNumber}–${selected.lastNumber}`}` : ''}`
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
