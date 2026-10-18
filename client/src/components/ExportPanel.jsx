import { useState } from 'react';
import { api } from '../services/api.js';

const FORMATS = [
  { id: 'pdf', extension: 'pdf', label: 'PDF', summary: 'PDF · 16:9', description: 'One page per slide, ready to present or share.' },
  { id: 'html', extension: 'html', label: 'Web page', summary: 'HTML', description: 'A single file that opens in any browser, with your notes.' },
  { id: 'md', extension: 'md', label: 'Markdown', summary: 'Markdown', description: 'Slidecraft Markdown you can edit or import again.' },
  { id: 'json', extension: 'json', label: 'JSON', summary: 'JSON', description: 'Slide data (text, notes, HTML) for other tools.' },
];

const NOTES = {
  pdf: 'Speaker notes are not included in the PDF. Images must use public https:// links to appear in the export.',
  html: 'Speaker notes appear under each slide on screen and are hidden when you print.',
  md: 'Long slides are saved already split, exactly as they appear in the preview.',
  json: 'Includes each slide’s title, layout, Markdown, sanitized HTML and speaker notes.',
};

/** Make a file name that is safe to save on any operating system. */
function toFilename(name, extension) {
  const base = name
    .replace(/\.(pdf|html?|json|md|markdown)$/i, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return `${base || 'presentation'}.${extension}`;
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

/** Summary of the deck, a choice of export format and a download button. */
export default function ExportPanel({ markdown, presentation, theme, transition, themes, onError, onSuccess }) {
  const [name, setName] = useState(presentation.title || 'presentation');
  const [formatId, setFormatId] = useState('pdf');
  const [exporting, setExporting] = useState(false);

  const format = FORMATS.find((f) => f.id === formatId);
  const slideCount = presentation.slides.length;
  const themeName = themes.find((t) => t.id === theme)?.name ?? theme;
  const filename = toFilename(name, format.extension);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportDeck(format.id, { markdown, theme, transition, filename });
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
          <dd>{format.summary}</dd>
        </div>
      </dl>

      <fieldset className="export-formats" disabled={exporting}>
        <legend className="label">Format</legend>
        {FORMATS.map((f) => (
          <label key={f.id} className={`ai-action ${formatId === f.id ? 'is-active' : ''}`}>
            <input type="radio" name="export-format" value={f.id} checked={formatId === f.id} onChange={() => setFormatId(f.id)} />
            <span>
              <strong>{f.label}</strong>
              <span className="muted">{f.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

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
            <span className="spinner" aria-hidden="true" /> Creating {format.label}…
          </>
        ) : (
          `Download ${format.label}`
        )}
      </button>
      {slideCount === 0 && <p className="muted">Add some slides first, then come back to export.</p>}
      <p className="muted export-note">{NOTES[format.id]}</p>
    </div>
  );
}
