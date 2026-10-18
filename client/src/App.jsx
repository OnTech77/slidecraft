import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, isAbortError } from './services/api.js';
import { useDebounce } from './hooks/useDebounce.js';
import MarkdownEditor from './components/MarkdownEditor.jsx';
import FileUpload from './components/FileUpload.jsx';
import SlidePreview from './components/SlidePreview.jsx';
import Alert from './components/Alert.jsx';
import Stepper from './components/Stepper.jsx';
import ThemeSelector from './components/ThemeSelector.jsx';
import AIEnhancePanel from './components/AIEnhancePanel.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import TransitionPicker from './components/TransitionPicker.jsx';
import { presenterUrl, useDeckBroadcast } from './services/presentChannel.js';

const EMPTY_PRESENTATION = { title: '', theme: 'default', transition: 'slide', slides: [] };

const STEPS = [
  { id: 'write', label: 'Write', title: 'Write your slides', description: 'Type or paste Markdown, or upload a file. The preview updates as you type.' },
  { id: 'theme', label: 'Theme', title: 'Choose a theme', description: 'Pick a look and a slide transition for your deck. You can change them at any time.' },
  { id: 'enhance', label: 'Enhance', title: 'Enhance with AI', description: 'Let AI polish your content. You review every change before it is applied.' },
  { id: 'export', label: 'Export', title: 'Export your deck', description: 'Download your slides as a PDF, a web page, Markdown or JSON.' },
];

export default function App() {
  const [markdown, setMarkdown] = useState('');
  const [filename, setFilename] = useState('');
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [step, setStep] = useState('write');
  const [themes, setThemes] = useState([]);
  // null means "use the theme from the deck's front matter".
  const [themeOverride, setThemeOverride] = useState(null);
  const [transitionOverride, setTransitionOverride] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  // Snapshot taken before the last AI change, so it can be undone.
  const [aiUndo, setAiUndo] = useState(null);

  const showError = useCallback((message) => setNotice({ type: 'error', message }), []);
  const showSuccess = useCallback((message) => setNotice({ type: 'success', message }), []);

  // Success messages fade away on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    api
      .getThemes()
      .then(({ themes: list }) => setThemes(list))
      .catch((err) => showError(err.message));
    api
      .getAIStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false, model: null, actions: [] }));
  }, [showError]);

  // Real-time preview: re-parse shortly after the user stops typing.
  const debouncedMarkdown = useDebounce(markdown, 300);
  useEffect(() => {
    const controller = new AbortController();
    setParsing(true);
    api
      .parseMarkdown(debouncedMarkdown, { signal: controller.signal })
      .then((result) => {
        setPresentation(result);
        setParseError(null);
      })
      .catch((err) => {
        if (!isAbortError(err)) setParseError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setParsing(false);
      });
    return () => controller.abort();
  }, [debouncedMarkdown]);

  const slides = presentation.slides;
  const current = Math.max(0, Math.min(currentSlide, slides.length - 1));
  const theme = themeOverride ?? presentation.theme;
  const transition = transitionOverride ?? presentation.transition ?? 'slide';

  // Share the deck with presenter tabs, which follow edits live.
  const presenterDeck = useMemo(() => ({ title: presentation.title, slides, theme, transition }), [presentation.title, slides, theme, transition]);
  useDeckBroadcast(presenterDeck, current);
  const handlePresent = () => window.open(presenterUrl(current), '_blank');
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const stepInfo = STEPS[stepIndex];

  const confirmReplace = () => !markdown.trim() || window.confirm('Replace your current Markdown? Unsaved changes will be lost.');

  const loadContent = (content, name, parsed) => {
    setMarkdown(content);
    setFilename(name);
    setCurrentSlide(0);
    setThemeOverride(null);
    setTransitionOverride(null);
    setAiUndo(null);
    if (parsed) setPresentation(parsed);
  };

  const handleApplyAI = (enhanced) => {
    setAiUndo({ before: markdown, after: enhanced });
    setMarkdown(enhanced);
    showSuccess('AI changes applied. You can undo them from this step.');
  };

  const handleUndoAI = () => {
    if (!aiUndo) return;
    if (markdown !== aiUndo.after && !window.confirm('You have edited the deck since the AI change. Undo anyway and lose those edits?')) return;
    setMarkdown(aiUndo.before);
    setAiUndo(null);
    showSuccess('AI changes undone.');
  };

  const handleLoadSample = async () => {
    if (!confirmReplace()) return;
    try {
      const { markdown: sample } = await api.getSample();
      loadContent(sample, 'sample.md');
      showSuccess('Sample deck loaded.');
    } catch (err) {
      showError(err.message);
    }
  };

  const handleClear = () => {
    if (!window.confirm('Clear all Markdown content?')) return;
    loadContent('', '');
  };

  const handleFile = async (file) => {
    if (!confirmReplace()) return;
    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      loadContent(result.markdown, result.filename, result.presentation);
      showSuccess(`Loaded ${result.filename} (${result.presentation.slides.length} slides).`);
    } catch (err) {
      showError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>Slidecraft</span>
        </div>
        <Stepper steps={STEPS} current={step} onChange={setStep} />
      </header>

      {notice && (
        <div className="notice-area">
          <Alert type={notice.type} onDismiss={() => setNotice(null)}>
            {notice.message}
          </Alert>
        </div>
      )}

      <main className="workspace">
        <aside className="panel">
          <div className="panel-section">
            <h1 className="panel-title">{stepInfo.title}</h1>
            <p className="muted">{stepInfo.description}</p>
          </div>

          {step === 'write' && (
            <>
              <FileUpload onFile={handleFile} onError={showError} busy={uploading} />
              <MarkdownEditor
                value={markdown}
                onChange={setMarkdown}
                onLoadSample={handleLoadSample}
                onClear={handleClear}
                slideCount={slides.length}
                filename={filename}
              />
            </>
          )}

          {step === 'theme' && (
            <>
              <ThemeSelector themes={themes} selected={theme} onSelect={setThemeOverride} previewSlide={slides[0]} />
              <TransitionPicker selected={transition} onSelect={setTransitionOverride} />
            </>
          )}

          {step === 'enhance' && (
            <AIEnhancePanel
              aiStatus={aiStatus}
              markdown={markdown}
              onApply={handleApplyAI}
              onError={showError}
              canUndo={Boolean(aiUndo)}
              onUndo={handleUndoAI}
            />
          )}

          {step === 'export' && (
            <ExportPanel
              markdown={markdown}
              presentation={presentation}
              theme={theme}
              transition={transition}
              themes={themes}
              onError={showError}
              onSuccess={showSuccess}
            />
          )}

          <div className="step-nav">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(STEPS[stepIndex - 1].id)} disabled={stepIndex === 0}>
              Back
            </button>
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className="btn btn-primary" onClick={() => setStep(STEPS[stepIndex + 1].id)}>
                Next: {STEPS[stepIndex + 1].label}
              </button>
            )}
          </div>
        </aside>

        <SlidePreview
          slides={slides}
          theme={theme}
          current={current}
          onSelect={setCurrentSlide}
          onPresent={handlePresent}
          loading={parsing}
          error={parseError}
        />
      </main>
    </div>
  );
}
