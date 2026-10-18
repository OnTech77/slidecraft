import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Presenter from './components/Presenter.jsx';
import { isPresenterView } from './services/presentChannel.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
// Fonts are bundled with the app, so they work offline and need no third-party requests.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {isPresenterView() ? <Presenter /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
