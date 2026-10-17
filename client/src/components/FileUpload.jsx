import { useRef, useState } from 'react';
import { MAX_UPLOAD_BYTES } from '../services/api.js';

const ALLOWED = /\.(md|markdown)$/i;

/** Check a file in the browser first so users get instant feedback before uploading. */
export function validateFile(file) {
  if (!file) return 'Please choose a file to upload.';
  if (!ALLOWED.test(file.name)) return 'Only Markdown files (.md or .markdown) can be uploaded.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is too large. The maximum size is 10 MB.';
  if (file.size === 0) return 'That file is empty. Please upload a file with some Markdown content.';
  return null;
}

/** Drag-and-drop zone plus a file picker for .md files. */
export default function FileUpload({ onFile, onError, busy }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      onError('Please upload one file at a time.');
      return;
    }
    const file = files[0];
    const problem = validateFile(file);
    if (problem) onError(problem);
    else onFile(file);
  };

  return (
    <div
      className={`dropzone ${dragging ? 'is-dragging' : ''} ${busy ? 'is-busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        className="visually-hidden"
        id="file-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        disabled={busy}
      />
      <div className="dropzone-text">
        <strong>{busy ? 'Uploading…' : 'Drop a .md file here'}</strong>
        <span className="muted">or</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          Browse files
        </button>
      </div>
      <span className="muted dropzone-hint">Markdown only, up to 10 MB</span>
    </div>
  );
}
