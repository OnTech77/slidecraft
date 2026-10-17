import { useEffect, useState } from 'react';
import { api } from './services/api.js';

export default function App() {
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    api
      .getThemes()
      .then(() => setServerOk(true))
      .catch(() => setServerOk(false));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>Slidecraft</span>
        </div>
      </header>
      <main className="app-main">
        <p>{serverOk === null ? 'Connecting…' : serverOk ? 'Connected to the Slidecraft server.' : 'Server unavailable.'}</p>
      </main>
    </div>
  );
}
