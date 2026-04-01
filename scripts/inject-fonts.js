const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

const ttfSrc = path.join(distDir, 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf');
const ttfDest = path.join(distDir, 'MaterialIcons.ttf');
if (fs.existsSync(ttfSrc)) {
  fs.copyFileSync(ttfSrc, ttfDest);
}

let html = fs.readFileSync(indexPath, 'utf8');

html = html.replace(/@font-face\{font-family:"MaterialIcons";src:url\("[^"]*"\)[^}]*\}/g, '');
html = html.replace(/<link rel="preload" href="[^"]*MaterialIcons[^"]*" as="font"[^>]*\/>/g, '');
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/icon\?family=Material\+Icons" \/>/g, '');
html = html.replace(/<style>@font-face\{font-family:"MaterialIcons"[^<]*<\/style>/g, '');

const inject = '<style>@font-face{font-family:"MaterialIcons";src:url("/MaterialIcons.ttf");font-display:block}</style>';

html = html.replace('</head>', `${inject}</head>`);
fs.writeFileSync(indexPath, html);
console.log('Injected MaterialIcons font at /MaterialIcons.ttf');
