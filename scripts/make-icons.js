#!/usr/bin/env node
/**
 * 生成 PWA 图标（柔光甜美版）。
 *
 * App 名叫「聚光灯」—— 一天只有一个人被照亮，明天灯就打到别人身上。
 * 图标就是这三个字压在暖粉渐变上。
 *
 * 为什么用 Chrome 渲染 HTML 而不是引 sharp/canvas：
 * 项目里没有图形库依赖，为了 4 张图标装一个原生模块不值得；
 * headless Chrome 本来就在（部署验证用得到），截图出来的抗锯齿也够好。
 *
 * 用法：node scripts/make-icons.js
 * 产出：assets/images/pwa-{180,192,512}.png + pwa-maskable-512.png
 *
 * 两条硬约束（都是踩出来的）：
 * 1. **整张图必须不透明、铺满、不留圆角**。iOS 不支持 apple-touch-icon 的 alpha 通道，
 *    任何透明像素都会被合成为黑色，主屏幕上就是一圈黑框。圆角交给系统裁。
 * 2. maskable 版会被 Android 裁成圆形/水滴等形状，安全区是中心 80% 的圆，
 *    所以字要更小 —— 三个字横排比单字更容易顶到边，别照抄普通版的字号。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'images');

/** 图标上的字。改 App 名时改这里，然后重跑本脚本。 */
const GLYPH = '聚光灯';
/** favicon 这类极小尺寸只放一个字：32px 下三个字会糊成一团灰。 */
const TINY_GLYPH = '灯';

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}\n用 CHROME_PATH=... 指定路径。`);
  process.exit(1);
}

/**
 * @param {number} size 画布边长
 * @param {'full'|'maskable'|'tiny'|'plain'} mode
 *   full     普通版：三个字铺满
 *   maskable Android 可裁版：字更小，留足被裁的余量
 *   tiny     favicon 尺寸：三个字在 32px 下会糊成一团，只放一个字
 *   plain    只有渐变、不放字（Android 自适应图标的背景层）
 */
function html(size, mode) {
  // 渐变必须铺满整个画布，不留白边、不加圆角。
  //
  // 这是踩过的坑：之前给普通版留了 6% 白边 + 22% 圆角，配合透明背景截图，
  // 四角和四边就成了全透明像素。而 **iOS 不支持 apple-touch-icon 的 alpha 通道**，
  // 会把透明区域合成为黑色 —— 加到主屏幕后图标周围一圈黑框。
  // 圆角本来就该交给系统裁（iOS 和 Android 都会自己裁），我们只负责给一张
  // 完全不透明的方图。
  const glyph =
    mode === 'tiny' ? size * 0.62 : mode === 'maskable' ? size * 0.195 : size * 0.225;
  const textOnly = mode === 'tiny' ? TINY_GLYPH : mode === 'plain' ? '' : GLYPH;
  const shadowY = size * 0.012;
  const shadowBlur = size * 0.045;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  /* body 也铺同一个渐变的主色：万一有半像素边缘，也是不透明的粉色而不是透明 */
  html,body { width:${size}px; height:${size}px; background:#FF9BA5; }
  .tile {
    width:${size}px; height:${size}px;
    background:
      radial-gradient(at 78% 16%, #FFD9BE 0%, transparent 54%),
      radial-gradient(at 20% 84%, #E7C4F0 0%, transparent 52%),
      linear-gradient(145deg, #FF8BA7 0%, #FFA898 52%, #FFC49B 100%);
    display:flex; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
  }
  /* 右上角一层柔光，跟 App 内「光从右上洒进来」一致 */
  .tile::before {
    content:''; position:absolute; width:${size * 0.9}px; height:${size * 0.9}px;
    border-radius:50%; top:${-size * 0.34}px; right:${-size * 0.30}px;
    background:radial-gradient(circle, rgba(255,255,255,.55), transparent 68%);
  }
  .glyph {
    position:relative;
    font-family:"SF Pro Rounded","Arial Rounded MT Bold","PingFang SC",-apple-system,sans-serif;
    font-size:${glyph}px; font-weight:800; color:#FFFFFF; line-height:1;
    letter-spacing:-${glyph * 0.04}px;
    white-space:nowrap;
    text-shadow:0 ${shadowY}px ${shadowBlur}px rgba(150, 60, 90, .30);
  }
</style></head><body>
  <div class="tile"><span class="glyph">${textOnly}</span></div>
</body></html>`;
}

/**
 * Android 主题图标（monochrome）层。
 *
 * 这一层的规则和其他所有图标**相反**：系统会拿它当蒙版，按用户壁纸取色重新上色，
 * 所以必须是「透明背景 + 单色实心图形」，不能铺渐变、也不能不透明。
 * 因此它不走 html()，单独生成。
 */
function monochromeHtml(size) {
  const glyph = size * 0.42;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${size}px; height:${size}px; background:transparent; }
  .wrap {
    width:${size}px; height:${size}px;
    display:flex; align-items:center; justify-content:center;
  }
  .glyph {
    font-family:"SF Pro Rounded","Arial Rounded MT Bold","PingFang SC",-apple-system,sans-serif;
    font-size:${glyph}px; font-weight:800; line-height:1;
    /* 纯不透明黑：系统只看 alpha 通道做蒙版，颜色本身会被替换掉 */
    color:#000000;
  }
</style></head><body>
  <div class="wrap"><span class="glyph">${TINY_GLYPH}</span></div>
</body></html>`;
}

const TARGETS = [
  // PWA / 「添加到主屏幕」
  { file: 'pwa-180.png', size: 180, mode: 'full' },
  { file: 'pwa-192.png', size: 192, mode: 'full' },
  { file: 'pwa-512.png', size: 512, mode: 'full' },
  { file: 'pwa-maskable-512.png', size: 512, mode: 'maskable' },
  // app.json 引用的原生资源。1024 是 iOS App Store 要求的尺寸，
  // 且**必须无 alpha**，正好和我们不透明铺满的做法一致。
  { file: 'icon.png', size: 1024, mode: 'full' },
  // 启动屏的图：resizeMode contain + imageWidth 200，所以给方图就行
  { file: 'splash-icon.png', size: 512, mode: 'full' },
  // Android 自适应图标的前景层会被裁，等同 maskable 的安全区要求
  { file: 'android-icon-foreground.png', size: 512, mode: 'maskable' },
  // 背景层：只要渐变，不放字（否则会和前景层的字叠成两层）。
  // 模板给的默认图是一张浅蓝安全区示意图，真打包会直接变成图标底色。
  { file: 'android-icon-background.png', size: 512, mode: 'plain' },
  // 浏览器标签页：32px 下三个字糊成一团，只放一个「灯」
  { file: 'favicon.png', size: 48, mode: 'tiny' },
  // 主题图标层：透明底 + 单色，规则和上面全部相反，见 monochromeHtml
  { file: 'android-icon-monochrome.png', size: 512, mode: 'monochrome' },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opad-icons-'));

for (const t of TARGETS) {
  const mono = t.mode === 'monochrome';
  const htmlPath = path.join(tmp, `${t.file}.html`);
  fs.writeFileSync(htmlPath, mono ? monochromeHtml(t.size) : html(t.size, t.mode));
  const outPath = path.join(outDir, t.file);

  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      // 除 monochrome 外都用不透明白底兜底（而不是 00000000 透明）：
      // 透明背景 + 任何留白都会让 iOS 把边缘渲染成黑色。
      // monochrome 层恰恰**需要**透明，它是给系统做蒙版用的。
      `--default-background-color=${mono ? '00000000' : 'FFFFFFFF'}`,
      `--window-size=${t.size},${t.size}`,
      `--screenshot=${outPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' }
  );

  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  const tag = t.mode === 'full' ? '' : `  (${t.mode})`;
  console.log(`  ${t.file.padEnd(28)} ${t.size}x${t.size}  ${kb} KB${tag}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

/* ---------- 自检：四角必须不透明 ---------- */
// iOS 会把 apple-touch-icon 的透明像素合成为黑色，这个 bug 真出现过
// （主屏幕图标一圈黑框）。所以生成完就解开 PNG 验四角，别等装到手机才发现。
// 只解到第一行和最后一行即可，但 PNG 的逐行滤波是有状态的，所以整张扫一遍。
function cornerAlphas(file) {
  const d = fs.readFileSync(file);
  const w = d.readUInt32BE(16);
  const h = d.readUInt32BE(20);
  if (d[25] !== 6) return null; // 不是 RGBA，没有 alpha，天然不透明
  let idat = [];
  let i = 8;
  while (i < d.length) {
    const len = d.readUInt32BE(i);
    const type = d.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(d.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  let pos = 0;
  const alphas = [];
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (ft === 1) line[x] = (line[x] + a) & 255;
      else if (ft === 2) line[x] = (line[x] + b) & 255;
      else if (ft === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    if (y === 0 || y === h - 1) {
      alphas.push(line[3], line[(w - 1) * bpp + 3]);
    }
    prev = line;
  }
  return alphas;
}

let allOpaque = true;
for (const t of TARGETS) {
  // monochrome 层本来就该是透明的（系统拿它做蒙版），不参与这项自检
  if (t.mode === 'monochrome') continue;
  const file = path.join(outDir, t.file);
  const a = cornerAlphas(file);
  if (a && a.some((v) => v < 255)) {
    allOpaque = false;
    console.log(`  ✗ ${t.file} 四角 alpha=${a.join(',')} —— iOS 会渲染成黑框！`);
  }
}

console.log(`\n图标已更新（${GLYPH}）。四角不透明自检：${allOpaque ? '通过 ✓' : '失败 ✗'}`);
console.log('提醒：改 App 名或背景色时，这几处要一起改 ——');
console.log('  1. 本脚本顶部的 GLYPH');
console.log('  2. web/manifest.json 的 name / short_name / 两个颜色');
console.log('  3. scripts/inject-fonts.js 的 apple-mobile-web-app-title 和 theme-color');
if (!allOpaque) process.exit(1);
