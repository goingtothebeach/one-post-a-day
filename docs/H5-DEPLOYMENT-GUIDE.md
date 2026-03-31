# One Post A Day - H5部署指南

**项目**: One Post A Day - 每天一帖社交平台  
**版本**: 1.0.0  
**生成时间**: 2026-03-31  
**部署类型**: 静态H5网页版

---

## 📦 已完成的工作

### ✅ Web兼容性修复
- **BlurView组件**: 为Web平台添加CSS `backdrop-filter` fallback
- **图片上传**: 已支持Web端的blob处理（`expo-image-picker`）
- **响应式布局**: 所有页面已适配桌面和移动端浏览器

### ✅ 生产版本导出
```bash
npx expo export -p web
```
- 输出目录: `dist/`
- 静态路由: 18个页面
- JS Bundle大小: 2.02 MB
- 所有资源已优化压缩

---

## 🗂️ 导出文件结构

```
dist/
├── index.html                    # 首页（Feed流 + 登录）
├── explore.html                  # 抽签页
├── profile.html                  # 个人主页
├── image.html                    # 图片预览
├── modal.html                    # 弹窗页
├── api.html                      # API页面
├── _sitemap.html                 # 站点地图
├── +not-found.html              # 404页面
├── favicon.ico                   # 网站图标
├── _expo/
│   └── static/
│       ├── js/                   # JavaScript打包文件
│       │   └── web/
│       │       └── entry-*.js   # 主入口文件 (2.02 MB)
│       └── css/                  # 样式文件
├── assets/                       # 静态资源（图片、字体）
├── (tabs)/                       # Tab页面的静态版本
├── config/                       # 配置页面
├── context/                      # 上下文页面
└── lib/                          # 库页面
```

---

## 🚀 快速部署步骤

### 方案1: 使用Nginx（推荐）

#### 1. 上传文件到服务器
```bash
# 本地打包
cd /Users/guoyixuan03/Documents/one-post-a-day
npx expo export -p web

# 上传到服务器（示例）
rsync -avz dist/ user@your-server.com:/var/www/one-post-a-day/
```

#### 2. 配置Nginx
创建配置文件 `/etc/nginx/sites-available/one-post-a-day`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改成你的域名
    
    # 网站根目录
    root /var/www/one-post-a-day;
    index index.html;
    
    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA路由处理（Expo Router需要）
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API代理（转发到后端）
    location /api/ {
        proxy_pass http://localhost:4000/;  # 后端地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. 启用配置并重启Nginx
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/one-post-a-day /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl reload nginx
```

---

### 方案2: 使用Docker（适合云服务）

创建 `Dockerfile`:
```dockerfile
FROM nginx:alpine

# 复制静态文件
COPY dist/ /usr/share/nginx/html/

# 复制Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

创建 `nginx.conf`:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

构建并运行:
```bash
docker build -t one-post-a-day-h5 .
docker run -d -p 80:80 one-post-a-day-h5
```

---

### 方案3: Vercel（零配置，免费）

#### 1. 安装Vercel CLI
```bash
npm i -g vercel
```

#### 2. 部署
```bash
cd /Users/guoyixuan03/Documents/one-post-a-day
vercel --prod

# 或者关联GitHub自动部署
vercel link
```

**配置文件** `vercel.json`:
```json
{
  "buildCommand": "npx expo export -p web",
  "outputDirectory": "dist",
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "http://your-backend-server.com/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

---

### 方案4: 阿里云OSS静态网站（适合国内）

#### 1. 上传文件到OSS
```bash
# 使用阿里云CLI或Web控制台
ossutil cp -r dist/ oss://your-bucket/
```

#### 2. 配置静态网站托管
- 进入OSS控制台 → 基础设置 → 静态页面
- 默认首页: `index.html`
- 默认404页: `+not-found.html`

#### 3. 配置CDN加速（可选）
- 创建CDN加速域名
- 配置HTTPS证书

---

## 🔧 环境变量配置

### 前端API地址修改
由于是静态文件，需要在**构建前**修改API地址：

编辑 `app/config/api.ts`:
```typescript
// 开发环境
// export const API_BASE = 'http://localhost:4000';

// 生产环境（改成你的域名）
export const API_BASE = 'https://api.your-domain.com';
```

然后重新导出:
```bash
npx expo export -p web
```

---

## 🌐 HTTPS配置（重要）

微信内分享**必须使用HTTPS**！

### 使用Let's Encrypt免费证书
```bash
# 安装Certbot
sudo apt-get install certbot python3-certbot-nginx

# 自动配置
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

配置后Nginx会自动重定向HTTP到HTTPS。

---

## 📱 微信内测试

### 1. 配置JS-SDK安全域名
- 登录微信公众平台
- 设置 → 公众号设置 → 功能设置
- JS接口安全域名: 填写你的域名（不含http/https）

### 2. 测试分享功能
H5版本分享会显示为链接，建议后续升级为小程序。

### 3. 调试技巧
```javascript
// 在浏览器控制台查看错误
// 或使用微信开发者工具 → 公众号网页调试
```

---

## 🧪 部署后测试清单

### 基础功能测试
- [ ] 访问首页 `https://your-domain.com`
- [ ] 点击"发送验证码" → 输入手机号 → 登录
- [ ] 浏览Feed流
- [ ] 查看抽签页
- [ ] 进入个人主页
- [ ] 上传图片（测试OSS）

### 性能测试
```bash
# 使用Lighthouse测试
# Chrome DevTools → Lighthouse → Generate report

# 目标指标：
# - Performance: > 90
# - Accessibility: > 95
# - Best Practices: > 90
```

### 兼容性测试
- [ ] Chrome/Safari桌面版
- [ ] 微信内置浏览器（iOS）
- [ ] 微信内置浏览器（Android）
- [ ] 手机Safari
- [ ] 手机Chrome

---

## 📊 当前限制与后续改进

### H5版本限制
| 功能 | H5支持 | 小程序支持 | 备注 |
|------|--------|-----------|------|
| 登录/浏览 | ✅ | ✅ | 完全支持 |
| 发帖/图片上传 | ✅ | ✅ | 完全支持 |
| 分享传播 | ⚠️ 有限 | ✅ 卡片样式 | H5只能分享链接 |
| 消息通知 | ❌ | ✅ 模板消息 | H5无法推送 |
| 下拉常驻入口 | ❌ | ✅ 任务栏 | H5每次需输入网址 |
| 相机拍照 | ⚠️ 有限制 | ✅ 完整支持 | H5权限受限 |

### 下一步优化方向
1. **短期（H5版本）**:
   - 添加PWA支持（可添加到桌面）
   - 优化首屏加载速度（代码分割）
   - 添加骨架屏loading

2. **中期（小程序）**:
   - 使用Taro重写前端
   - 利用小程序分享裂变
   - 接入微信支付

3. **长期（App）**:
   - 使用现有React Native代码打包iOS/Android
   - 上架App Store/Google Play

---

## 💰 成本估算

### 基础版（阿里云）
```
- ECS轻量应用服务器: ¥100/月
- OSS存储: ¥0.12/GB/月
- 流量费用: ¥0.5/GB
- 域名: ¥50/年
- 估算月成本: ¥150-200
```

### 零成本方案（适合测试）
- Vercel托管: 免费
- 后端Railway部署: 免费额度
- 图片Cloudinary: 免费25GB
- 总成本: ¥0/月（有流量限制）

---

## 🐛 常见问题

### Q1: 页面刷新后404
A: Nginx配置中添加 `try_files $uri $uri/ /index.html;`

### Q2: API请求CORS错误
A: 后端添加CORS headers或使用Nginx代理

### Q3: 图片上传失败
A: 检查OSS配置和STS临时凭证是否正确

### Q4: 微信内白屏
A: 检查HTTPS是否配置、查看微信开发者工具控制台错误

---

## 📞 技术支持

- **项目仓库**: https://github.com/owenandveronica/one-post-a-day
- **后端API文档**: http://localhost:4000/docs
- **设计系统**: `constants/design-system.ts`

---

## ✅ 部署成功标志

当你完成以下步骤，说明部署成功：
1. ✅ 在浏览器访问域名能看到登录页
2. ✅ 能用手机号接收验证码并登录
3. ✅ 能浏览Feed流内容
4. ✅ 能成功发帖并上传图片
5. ✅ 微信内打开正常显示（HTTPS）

**祝部署顺利！** 🎉

如有问题，建议先在本地测试 `npx expo start --web`，确认功能正常后再部署。
