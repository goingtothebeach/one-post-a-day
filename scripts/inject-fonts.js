/**
 * 构建后处理（`npx expo export -p web` 之后必须跑）。
 *
 * 做两件事：
 *   1. 关掉 SSR hydration —— 修复 Tab active 状态错位
 *   2. 注入 PWA 标签 + 拷贝 manifest 和图标 —— 让「添加到主屏幕」后
 *      有独立图标、全屏运行（无 Safari 地址栏），接近原生观感
 *
 * 为什么在构建后注入而不用 app/+html.tsx：
 * expo-router 的自定义 HTML 外壳只影响 SSR 产物，而这个项目
 * 用 inject 的方式已经在处理 hydration，放一起更不容易漏。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

function getAllHtmlFiles(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...getAllHtmlFiles(full));
    else if (item.endsWith('.html')) results.push(full);
  }
  return results;
}

/* ---------- 1. 拷贝 manifest 与 PWA 图标到 dist ---------- */
const manifestSrc = path.join(root, 'web', 'manifest.json');
if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, path.join(distDir, 'manifest.json'));
}

const iconDir = path.join(distDir, 'assets', 'images');
fs.mkdirSync(iconDir, { recursive: true });
const icons = ['pwa-180.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'];
let copiedIcons = 0;
for (const name of icons) {
  const src = path.join(root, 'assets', 'images', name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(iconDir, name));
    copiedIcons++;
  }
}

// iOS 加到主屏幕时会【先】请求根路径的 /apple-touch-icon.png，
// 不看 head 里的 link 标签。这些文件不存在时，nginx 的 SPA 兜底会把
// index.html 返回给它，iOS 拿 HTML 当 PNG 解析失败 → 主屏幕显示灰色占位图标。
// 所以在根路径放真文件（precomposed 是老设备的变体，一并提供）。
const rootIconSrc = path.join(root, 'assets', 'images', 'pwa-180.png');
if (fs.existsSync(rootIconSrc)) {
  for (const name of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) {
    fs.copyFileSync(rootIconSrc, path.join(distDir, name));
    copiedIcons++;
  }
}

/* ---------- 2. 注入 PWA / iOS 标签 ---------- */
// theme-color 用纸底色，让 iOS 状态栏与页面背景连成一片。
// apple-mobile-web-app-capable 是「添加到主屏幕后全屏运行」的关键。
// status-bar-style 用 default（浅底深字），配合暖白纸底；black-translucent
// 会让内容顶到状态栏下面，和我们已有的 use-app-insets 顶部留白冲突。
const PWA_TAGS = [
  '<link rel="manifest" href="/manifest.json"/>',
  '<meta name="theme-color" content="#FAF8F3"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>',
  '<meta name="apple-mobile-web-app-title" content="每日一帖"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/pwa-180.png"/>',
  '<link rel="icon" type="image/png" sizes="192x192" href="/assets/images/pwa-192.png"/>',
  '<meta name="format-detection" content="telephone=no"/>',
].join('');

const htmlFiles = getAllHtmlFiles(distDir);
let hydrationPatched = 0;
let pwaPatched = 0;

for (const filePath of htmlFiles) {
  let html = fs.readFileSync(filePath, 'utf8');
  const before = html;

  if (html.includes('globalThis.__EXPO_ROUTER_HYDRATE__=true;')) {
    html = html.replace(
      'globalThis.__EXPO_ROUTER_HYDRATE__=true;',
      'globalThis.__EXPO_ROUTER_HYDRATE__=false;'
    );
    hydrationPatched++;
  }

  // 幂等：已经注入过就不再重复（重复的 manifest link 会让部分浏览器告警）
  if (!html.includes('rel="manifest"')) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${PWA_TAGS}</head>`);
      pwaPatched++;
    }
  }

  if (html !== before) fs.writeFileSync(filePath, html);
}

console.log(
  `Patched ${htmlFiles.length} HTML files: ` +
    `hydration off (${hydrationPatched}), PWA tags (${pwaPatched}), icons copied (${copiedIcons})`
);
