import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Presenter from './components/Presenter.jsx';
import { isPresenterView } from './services/presentChannel.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {isPresenterView() ? <Presenter /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
