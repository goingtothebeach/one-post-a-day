#!/usr/bin/env node
/**
 * 生成 PWA 图标（柔光甜美版）。
 *
 * 上一版图标是「朱红方印 + 衬线『日』+ 米白底 + 直角」，那是「纸墨日刊」的语言。
 * 改版后整体是暖粉渐变 + 大圆角 + 圆润字，旧图标放在主屏幕上会明显是另一套东西。
 *
 * 为什么用 Chrome 渲染 HTML 而不是引 sharp/canvas：
 * 项目里没有图形库依赖，为了 4 张图标装一个原生模块不值得；
 * headless Chrome 本来就在（部署验证用得到），截图出来的抗锯齿也够好。
 *
 * 用法：node scripts/make-icons.js
 * 产出：assets/images/pwa-{180,192,512}.png + pwa-maskable-512.png
 *
 * 注意 maskable 版本：Android 会把图标裁成圆形/圆角方形等各种形状，
 * 安全区是中心 80% 的圆。所以 maskable 版的「日」要画得更小、渐变铺满整个画布，
 * 不能留白边——否则被裁掉一圈后会看起来偏移。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'images');

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}\n用 CHROME_PATH=... 指定路径。`);
  process.exit(1);
}

/**
 * @param {number} size 画布边长
 * @param {boolean} maskable Android maskable 版：渐变铺满 + 字更小
 */
function html(size, maskable) {
  // 圆角：普通版留白边 + 大圆角（iOS 会自己再裁一次圆角，所以这里的圆角只影响
  // Android 和浏览器标签页）；maskable 版必须铺满，圆角交给系统裁。
  const pad = maskable ? 0 : size * 0.06;
  const radius = maskable ? 0 : size * 0.22;
  const box = size - pad * 2;
  // maskable 安全区是中心 80% 圆，字号相应收小
  const glyph = maskable ? size * 0.40 : size * 0.52;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${size}px; height:${size}px; background:transparent; }
  .wrap {
    width:${size}px; height:${size}px; padding:${pad}px;
    display:flex; align-items:center; justify-content:center;
  }
  .tile {
    width:${box}px; height:${box}px; border-radius:${radius}px;
    background:
      radial-gradient(at 78% 16%, #FFD9BE 0%, transparent 54%),
      radial-gradient(at 20% 84%, #E7C4F0 0%, transparent 52%),
      linear-gradient(145deg, #FF8BA7 0%, #FFA898 52%, #FFC49B 100%);
    display:flex; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
  }
  /* 右上角一层柔光，跟 App 内「光从右上洒进来」一致 */
  .tile::before {
    content:''; position:absolute; width:${box * 0.9}px; height:${box * 0.9}px;
    border-radius:50%; top:${-box * 0.34}px; right:${-box * 0.30}px;
    background:radial-gradient(circle, rgba(255,255,255,.55), transparent 68%);
  }
  .glyph {
    position:relative;
    font-family:"SF Pro Rounded","Arial Rounded MT Bold","PingFang SC",-apple-system,sans-serif;
    font-size:${glyph}px; font-weight:800; color:#FFFFFF; line-height:1;
    letter-spacing:-${glyph * 0.02}px;
    text-shadow:0 ${size * 0.012}px ${size * 0.045}px rgba(150, 60, 90, .30);
  }
</style></head><body>
  <div class="wrap"><div class="tile"><span class="glyph">日</span></div></div>
</body></html>`;
}

const TARGETS = [
  { file: 'pwa-180.png', size: 180, maskable: false },
  { file: 'pwa-192.png', size: 192, maskable: false },
  { file: 'pwa-512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512.png', size: 512, maskable: true },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opad-icons-'));

for (const t of TARGETS) {
  const htmlPath = path.join(tmp, `${t.file}.html`);
  fs.writeFileSync(htmlPath, html(t.size, t.maskable));
  const outPath = path.join(outDir, t.file);

  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000', // 透明背景，别填白
      `--window-size=${t.size},${t.size}`,
      `--screenshot=${outPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' }
  );

  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`  ${t.file}  ${t.size}x${t.size}  ${kb} KB${t.maskable ? '  (maskable)' : ''}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n图标已更新。web/manifest.json 和 scripts/inject-fonts.js 里的 theme-color');
console.log('要跟 DS.gradient.page 的第一段保持一致（当前 #FFF6F1）。');
