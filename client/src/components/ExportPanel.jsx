import { useState } from 'react';
import { api } from '../services/api.js';

/** Make a file name that is safe to save on any operating system. */
function toFilename(name) {
  const base = name
    .replace(/\.pdf$/i, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return `${base || 'presentation'}.pdf`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Summary of the deck plus a button that downloads it as a PDF. */
export default function ExportPanel({ markdown, presentation, theme, themes, onError, onSuccess }) {
  const [name, setName] = useState(presentation.title || 'presentation');
  const [exporting, setExporting] = useState(false);

  const slideCount = presentation.slides.length;
  const themeName = themes.find((t) => t.id === theme)?.name ?? theme;
  const filename = toFilename(name);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportPdf(markdown, theme, filename);
      downloadBlob(blob, filename);
      onSuccess(`Downloaded ${filename}.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-panel">
      <dl className="summary">
        <div>
          <dt>Title</dt>
          <dd>{presentation.title || '—'}</dd>
        </div>
        <div>
          <dt>Slides</dt>
          <dd>{slideCount}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>{themeName}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>PDF · 16:9</dd>
        </div>
      </dl>

      <div className="field">
        <label htmlFor="export-name" className="label">
          File name
        </label>
        <input id="export-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <span className="muted field-hint">Saved as {filename}</span>
      </div>

      <button type="button" className="btn btn-primary btn-lg" onClick={handleExport} disabled={exporting || slideCount === 0}>
        {exporting ? (
          <>
            <span className="spinner" aria-hidden="true" /> Creating PDF…
          </>
        ) : (
          'Download PDF'
        )}
      </button>
      {slideCount === 0 && <p className="muted">Add some slides first, then come back to export.</p>}
      <p className="muted export-note">Speaker notes are not included in the PDF. Images must use public https:// links to appear in the export.</p>
    </div>
  );
}
