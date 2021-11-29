import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom';

// (window as any).global = window;

import App from './app/app';

ReactDOM.render(
  <StrictMode>
    <App />
  </StrictMode>,
  document.getElementById('root')
);
