/**
 * Browser stand-in for the parts of jsdom the server's slide code uses, so the GitHub Pages
 * build can run that code unchanged. The browser already has a DOM, so it is used directly.
 */
export class JSDOM {
  constructor() {
    this.window = window;
  }

  /** Parse HTML into a fragment. Template content is inert: no scripts run and nothing loads. */
  static fragment(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
  }
}
