# Railway 后端部署指南

## 📦 准备工作

Railway已注册：✅

---

## 🚀 部署步骤（5分钟完成）

### Step 1: 准备配置文件

已创建以下文件：
- ✅ `railway.json` - Railway配置
- ✅ `Procfile` - 启动命令
- ✅ `runtime.txt` - Python版本

### Step 2: 推送代码到GitHub

```bash
# 1. 检查当前状态
git status

# 2. 添加新文件
git add railway.json Procfile runtime.txt server/

# 3. 提交
git commit -m "Add Railway deployment config"

# 4. 推送到GitHub
git push origin main
```

### Step 3: 在Railway创建项目

1. 访问 https://railway.app/dashboard
2. 点击 **"New Project"**
3. 选择 **"Deploy from GitHub repo"**
4. 找到并选择 `owenandveronica/one-post-a-day`
5. 点击 **"Deploy Now"**

### Step 4: 配置环境变量

在Railway项目中，点击 **"Variables"** 标签，添加以下环境变量：

```bash
# 必需配置
JWT_SECRET=your-super-secret-key-here-change-this
DATABASE_URL=mysql+pymysql://root:password@mysql.railway.internal:3306/one_post_a_day

# 可选配置（开发模式）
DEV_FAKE_OTP=1

# 阿里云OSS配置（如果需要图片上传）
ALIYUN_OSS_BUCKET=one-post-a-day
ALIYUN_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
ALIYUN_ACCESS_KEY_ID=your-access-key
ALIYUN_ACCESS_KEY_SECRET=your-secret-key
```

**重要**：
- `JWT_SECRET`：生成一个随机密钥（不要用默认值）
- `DATABASE_URL`：Railway会自动创建MySQL数据库，复制连接字符串

### Step 5: 添加MySQL数据库

1. 在Railway项目页面，点击 **"+ New"**
2. 选择 **"Database" → "MySQL"**
3. 等待数据库创建完成
4. 点击MySQL服务，复制 **"Connection String"**
5. 将连接字符串设置为 `DATABASE_URL` 环境变量
   - 需要修改格式：`mysql://` → `mysql+pymysql://`

### Step 6: 配置启动命令

Railway会自动读取`Procfile`，但你也可以手动设置：

1. 点击 **"Settings"** 标签
2. 找到 **"Deploy"** 部分
3. **Root Directory**: `server/`
4. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Step 7: 部署并获取URL

1. Railway会自动开始部署
2. 等待构建完成（约2-3分钟）
3. 点击 **"Settings" → "Domains"**
4. 点击 **"Generate Domain"**
5. 复制生成的域名（例如：`one-post-a-day-production.up.railway.app`）

---

## ✅ 验证部署成功

访问以下URL验证：

```bash
# 健康检查
https://your-app.up.railway.app/health

# 应该返回：{"ok":true}
```

---

## 🔧 初始化数据库

部署成功后，需要初始化数据库表：

**方式1：通过Railway CLI**
```bash
# 安装Railway CLI
npm i -g @railway/cli

# 登录
railway login

# 连接到项目
railway link

# 运行初始化脚本
railway run python init_db.py
```

**方式2：手动执行SQL**
Railway MySQL控制台中运行 `server/init_db.sql`（如果你创建了这个文件）

---

## 🐛 常见问题

### 1. 数据库连接失败
- 检查 `DATABASE_URL` 格式是否正确
- 确保使用 `mysql+pymysql://` 前缀
- 检查MySQL服务是否已启动

### 2. 模块找不到
- 检查 `requirements.txt` 是否包含所有依赖
- Railway会自动安装 `requirements.txt` 中的包

### 3. 端口错误
- Railway会自动分配 `PORT` 环境变量
- 确保使用 `--port $PORT` 而不是固定端口

### 4. 启动超时
- Railway默认超时5分钟
- 检查启动日志，查看错误信息

---

## 📊 监控和日志

1. 在Railway项目页面，点击 **"Deployments"**
2. 点击最新的部署，查看构建日志
3. 点击 **"View Logs"** 查看运行时日志

---

## 💰 成本说明

Railway免费额度：
- **$5/月** 免费额度
- 数据库存储：1GB
- 对于测试和小规模使用完全够用

如果超出免费额度：
- 按使用量计费
- 约 $0.000231/分钟（约$10/月持续运行）

---

## 🎯 下一步

部署成功后：
1. ✅ 记录后端URL（例如：`https://one-post-a-day-production.up.railway.app`）
2. ➡️ 继续部署前端（Vercel）
3. ➡️ 配置前端API地址指向Railway后端

---

**准备好了吗？完成上述步骤后告诉我，我会帮你部署前端！** 🚀
