import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { startSession } from './firebase/session';
import { applyTheme } from './state/theme';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/components.css';
import './styles/app.css';

applyTheme();
startSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
