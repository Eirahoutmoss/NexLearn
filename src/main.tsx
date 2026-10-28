import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/index.css';
// Yalnızca Latin + Latin Genişletilmiş (Türkçe karakterler) alt kümeleri paketlenir; çevrimdışı çalışır.
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-ext-400.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/latin-ext-400-italic.css';
import '@fontsource/literata/latin-600.css';
import '@fontsource/literata/latin-ext-600.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import '@fontsource/opendyslexic/latin-400.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
