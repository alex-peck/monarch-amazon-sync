import 'react';
import { createRoot } from 'react-dom/client';
import '@pages/popup/index.css';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import Popup from './Popup';

refreshOnUpdate('pages/popup');

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<Popup />);
}

init();
