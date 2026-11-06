// Point d'entrée : polices embarquées, styles, interface, stockage.
import { render } from 'preact';
import css from './ui/styles.css';
import editorCss from './ui/editor/editor.css';
import pixelify400 from '@fontsource/pixelify-sans/files/pixelify-sans-latin-400-normal.woff2';
import pixelify700 from '@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2';
import silkscreen from '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2';
import { App } from './ui/App';
import { initCloudStorage } from './platform/storage';

const fonts = `
@font-face { font-family: 'Pixelify Sans'; font-weight: 400; font-display: swap; src: url(${pixelify400}) format('woff2'); }
@font-face { font-family: 'Pixelify Sans'; font-weight: 700; font-display: swap; src: url(${pixelify700}) format('woff2'); }
@font-face { font-family: 'Silkscreen'; font-weight: 400; font-display: swap; src: url(${silkscreen}) format('woff2'); }
`;
const style = document.createElement('style');
style.textContent = fonts + css + editorCss;
document.head.appendChild(style);

void initCloudStorage();
render(<App />, document.getElementById('app')!);
