import { useCallback, useEffect, useState } from 'react';
import { api, isAbortError } from './services/api.js';
import { useDebounce } from './hooks/useDebounce.js';
import MarkdownEditor from './components/MarkdownEditor.jsx';
import FileUpload from './components/FileUpload.jsx';
import SlidePreview from './components/SlidePreview.jsx';
import Alert from './components/Alert.jsx';

const EMPTY_PRESENTATION = { title: '', theme: 'default', slides: [] };

export default function App() {
  const [markdown, setMarkdown] = useState('');
  const [filename, setFilename] = useState('');
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);

  const showError = useCallback((message) => setNotice({ type: 'error', message }), []);
  const showSuccess = useCallback((message) => setNotice({ type: 'success', message }), []);

  // Success messages fade away on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

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
  const theme = presentation.theme;

  const confirmReplace = () => !markdown.trim() || window.confirm('Replace your current Markdown? Unsaved changes will be lost.');

  const loadContent = (content, name, parsed) => {
    setMarkdown(content);
    setFilename(name);
    setCurrentSlide(0);
    if (parsed) setPresentation(parsed);
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
            <h1 className="panel-title">Write your slides</h1>
            <p className="muted">Type or paste Markdown, or upload a file. The preview updates as you type.</p>
          </div>
          <FileUpload onFile={handleFile} onError={showError} busy={uploading} />
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            onLoadSample={handleLoadSample}
            onClear={handleClear}
            slideCount={slides.length}
            filename={filename}
          />
        </aside>

        <SlidePreview slides={slides} theme={theme} current={current} onSelect={setCurrentSlide} loading={parsing} error={parseError} />
      </main>
    </div>
  );
}
