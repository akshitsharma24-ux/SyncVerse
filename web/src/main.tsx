import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import App from './App';

// StrictMode is intentionally OFF: in dev it double-mounts effects, which opens duplicate Monaco / WebSocket /
// LiveKit connections. Turn it on later if you want, but fix the cleanups first.
createRoot(document.getElementById('root')!).render(<App />);
