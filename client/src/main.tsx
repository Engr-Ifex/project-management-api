import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted. No external font CDN: a blocked request to a third-party host
// would silently fall back to a system font and change every metric on the page.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import '@/styles/index.css';
import { App } from '@/app/App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found — check index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
