const fs = require('fs');
const path = require('path');
const { globSync } = require('fs');

const distDir = path.join(__dirname, '..', 'dist');

function getAllHtmlFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllHtmlFiles(full));
    } else if (item.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const htmlFiles = getAllHtmlFiles(distDir);

for (const filePath of htmlFiles) {
  let html = fs.readFileSync(filePath, 'utf8');

  html = html.replace(
    'globalThis.__EXPO_ROUTER_HYDRATE__=true;',
    'globalThis.__EXPO_ROUTER_HYDRATE__=false;'
  );

  fs.writeFileSync(filePath, html);
}

console.log(`Patched ${htmlFiles.length} HTML files: disabled SSR hydration`);
