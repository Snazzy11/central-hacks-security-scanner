// Mantine's component styles. Without these imports Mantine components render unstyled.
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { createRoot } from 'react-dom/client';

import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
