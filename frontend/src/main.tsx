import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './lib/auth-runtime';
import { App } from './App';
import { ThemeProvider } from './components/Theme';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ThemeProvider><AuthProvider><App/></AuthProvider></ThemeProvider></React.StrictMode>);
import './race.css';
import './hud.css';
import './rooms.css';
import './result.css';

import './stitch-components.css';
import './garage.css';
import './collections.css';
