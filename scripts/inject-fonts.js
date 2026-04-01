const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const fontLink = '<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />';

if (!html.includes('Material+Icons')) {
  html = html.replace('</head>', `${fontLink}</head>`);
  fs.writeFileSync(indexPath, html);
  console.log('Injected Material Icons font link');
} else {
  console.log('Material Icons already present');
}
