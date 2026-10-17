const PLACEHOLDER = `# My presentation
A short subtitle

---

## First topic
- A key point
- Another point

Note: Speaker notes go here.`;

/** Plain-text Markdown editor with helpful stats and quick actions. */
export default function MarkdownEditor({ value, onChange, onLoadSample, onClear, slideCount, filename }) {
  const handleKeyDown = (event) => {
    // Insert two spaces for Tab so nested lists are easy to write.
    if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const el = event.currentTarget;
      const { selectionStart, selectionEnd } = el;
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2;
      });
    }
  };

  return (
    <div className="editor">
      <div className="editor-header">
        <label htmlFor="markdown-input" className="label">
          Markdown {filename && <span className="filename" title={filename}>· {filename}</span>}
        </label>
        <div className="button-group">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLoadSample}>
            Load sample
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={!value}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        id="markdown-input"
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER}
        spellCheck
      />
      <div className="editor-footer muted">
        <span>
          {slideCount} {slideCount === 1 ? 'slide' : 'slides'} · {value.length.toLocaleString()} characters
        </span>
        <span>
          Separate slides with <code>---</code>
        </span>
      </div>
    </div>
  );
}
