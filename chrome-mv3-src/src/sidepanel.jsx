import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './shared.jsx';

createRoot(document.getElementById('root')).render(<App isPopup={false} />);
