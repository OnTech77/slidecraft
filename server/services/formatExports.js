import { buildPresentationHtml } from './slideGenerator.js';

// Screen styles for the standalone HTML file: slides stacked on a neutral page, scaled to the
// window width, with speaker notes under each slide. Printing gives one slide per page.
const VIEWER_CSS = `
body { background: #e9ebf0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.sc-deck { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 32px 16px; }
.sc-deck > figure { margin: 0; }
.sc-deck .sc-slide { box-shadow: 0 2px 6px rgba(20, 24, 45, 0.08), 0 16px 40px rgba(20, 24, 45, 0.14); border-radius: 8px; }
.sc-notes { max-width: 1280px; margin: 12px 0 0; padding: 10px 14px; background: #fff; border-radius: 8px; color: #4b5563; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.sc-notes strong { color: #1f2937; }
@media print {
  body { background: none; }
  .sc-deck { display: block; padding: 0; }
  .sc-deck .sc-slide { zoom: 1 !important; box-shadow: none; border-radius: 0; }
  .sc-notes { display: none; }
}`;

// Scale every slide to fit the window. Slides are designed at 1280x720.
const VIEWER_SCRIPT = `
function fitSlides() {
  var zoom = Math.min(1, (document.documentElement.clientWidth - 32) / 1280);
  document.querySelectorAll('.sc-deck .sc-slide').forEach(function (slide) { slide.style.zoom = zoom; });
}
addEventListener('resize', fitSlides);
fitSlides();`;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A self-contained HTML file that opens in any browser, with notes under each slide. */
export function buildStandaloneHtml(presentation) {
  return buildPresentationHtml(presentation, {
    extraCss: VIEWER_CSS,
    script: VIEWER_SCRIPT,
    wrapSlide: (slideHtml, slide) =>
      `<figure>${slideHtml}${slide.notes ? `\n<figcaption class="sc-notes"><strong>Notes:</strong> ${escapeHtml(slide.notes)}</figcaption>` : ''}</figure>`,
  });
}

/** The parsed deck as JSON, for use in other tools. */
export function buildJson(presentation) {
  const data = {
    title: presentation.title,
    theme: presentation.theme,
    meta: presentation.meta,
    slideCount: presentation.slides.length,
    slides: presentation.slides.map((slide, i) => ({
      number: i + 1,
      title: slide.title,
      layout: slide.layout,
      markdown: slide.markdown,
      notes: slide.notes,
      html: slide.html,
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * The deck as Slidecraft Markdown: front matter, then slides separated by `---`, exactly as
 * they appear in the preview (long slides already split). Importing it gives the same deck.
 */
export function buildMarkdown(presentation) {
  const meta = { ...presentation.meta, title: presentation.title, theme: presentation.theme };
  const frontMatter = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value).replace(/\s+/g, ' ')}`)
    .join('\n');
  const slides = presentation.slides.map((slide) => (slide.notes ? `${slide.markdown}\n\nNote: ${slide.notes}` : slide.markdown));
  return `---\n${frontMatter}\n---\n\n${slides.join('\n\n---\n\n')}\n`;
}
