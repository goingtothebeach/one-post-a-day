# One Post A Day - 项目状态总结

**最后更新**: 2026-04-10  
**项目状态**: 前后端均已上线，持续迭代中  
**GitHub**: https://github.com/goingtothebeach/one-post-a-day.git  
**前端地址**: https://onedayapost.fun  
**后端地址**: https://api.onedayapost.fun（阿里云香港 47.243.211.168，已上线）

---

## 项目介绍

**One Post A Day** - 每天一帖社交平台

每天 18:00 自动抽签，中签者获得**唯一发帖权**，有效期到次日 18:00（下一轮抽签前）。

---

## 技术架构

| 层 | 技术 | 部署 |
|----|------|------|
| 前端 | React Native + Expo（static export） | Vercel（https://onedayapost.fun） |
| 后端 | FastAPI + SQLAlchemy | 香港/境外 VPS（systemd + nginx 反代） |
| 数据库 | MySQL 8.0 | 服务器本机自建 |
| 图片存储 | 阿里云 OSS | 北京区域，bucket `onedayapost-media` |
| 定时任务 | GitHub Actions（每天 UTC 10:00 = 北京 18:00） | GitHub |

---

## 常用命令

```bash
# 构建前端
cd /Users/guoyixuan03/Documents/one-post-a-day
npx expo export -p web
node scripts/inject-fonts.js

# 构建 + 部署（完整流程）
npx expo export -p web && node scripts/inject-fonts.js && git add -f dist/ && git commit -m "..." && git push origin main

# 启动本地后端
cd server && uvicorn main:app --reload --port 4000
```

---

## 已完成功能

| 功能 | 说明 |
|------|------|
| 手机号登录 | OTP 验证码，阿里云短信 |
| Feed 流 | 卡片式，显示作者头像/昵称，支持点赞收藏 |
| 点赞 / 收藏 | 实时更新，个人主页可查看列表 |
| 抽签系统 | 报名、18:00 自动抽签（GitHub Actions 触发）、状态持久化 |
| 发帖功能 | 文字 + 多图（最多 6 张），仅中签者可发 |
| 发帖时效 | 中签后到次日 18:00 有效，过期自动失效 |
| 个人主页 | 头像/昵称/ID 展示，设置入口，点赞/收藏 Tab |
| 修改头像/昵称 | 阿里云 OSS STS 上传，个人主页设置弹窗 |
| 随机昵称 | 注册时未填写则自动生成（100×100 词库，1万种组合） |
| 图片预览 | 全屏预览 |
| 倒计时 | 中签后展示距发帖截止还剩多少小时 |
| 中签展示 | 抽签页展示中签者头像、昵称、ID，光环效果 |

---

## 前端关键实现细节

### 构建和部署
- 构建命令：`npx expo export -p web`
- 构建后必须运行 `node scripts/inject-fonts.js`，做两件事：
  1. 注入 MaterialIcons `@font-face`（现已改用 lucide，但保留以防兼容）
  2. 将所有 HTML 的 `__EXPO_ROUTER_HYDRATE__=true` 改为 `false`（禁用 SSR hydration，修复 Tab active 错位）
- `dist/` 需要 `git add -f` 强制追踪
- Vercel 通过 `vercel.json` 按路由 serve 对应 HTML（`/profile` → `profile.html`，`/explore` → `explore.html`，其他 → `index.html`）

### Tab 布局
- 始终渲染 3 个 tab（home/explore/profile），不根据登录状态隐藏，避免 hydration 时 tab index 错位
- 未登录访问 `/explore` 或 `/profile`：页面内部用 `useEffect + router.replace('/')` 重定向

### 图标库
- 已从 MaterialIcons 迁移到 `lucide-react-native`（纯 SVG，不依赖字体文件）
- 点赞：`Heart`，收藏：`Bookmark`，导航：`Home / Ticket / User`，设置：`Settings`

### 顶部安全区
- 自定义 hook `hooks/use-app-insets.ts`：web 端 `WEB_TOP_PADDING = 28`，native 用 `useSafeAreaInsets`

### 输入框样式
- 所有 `TextInput` 加了 `outline: 'none'`（通过 `...(({ outline: 'none' }) as any)` 注入），消除 web 端 focus 方框

---

## 后端关键实现细节

### 时区
- 所有时间判断必须用 `app/timewin.py` 里的 `now_shanghai()`（基于 `zoneinfo.ZoneInfo('Asia/Shanghai')`，并 `.replace(tzinfo=None)`）
- 服务器时区已设为 Asia/Shanghai，但代码仍必须用 `now_shanghai()`——
  换机器/换云厂商时时区可能又是 UTC，直接用 `datetime.now()` 会让 18:00 判断错位
- `tzdata` 包已加入 `requirements.txt`，确保容器有时区数据

### 抽签时效逻辑
**所有轮次判断统一在 `server/app/timewin.py`**，不要再在各模块复制一份：
- `next_draw_date()`：报名进入的轮次。18:00 前 → 今晚；18:00 后 → 明晚
- `current_draw_date()`：当前活跃轮次。18:00 前 → 昨天那轮（发帖窗口仍开）；18:00 后 → 今天这轮
- `draw_date_for_run()`：抽签任务要开的轮次 = `current_draw_date()`。
  **关键**：GitHub Actions 经常延迟，若延迟跨过午夜，必须仍开【昨天】那轮，
  而不是按「执行时刻的自然日」去抽次日的名单（那是给明晚准备的）
- `post_deadline(draw_date)` = `draw_date + 1天18小时`（次日 18:00，下一轮抽签前）

⚠️ 注意语义：**18:00 前报名的人参与「当晚」抽签、中签后当晚就能发帖**，不是第二天。
只有 18:00 后报名才顺延到明晚。

### 中签态判定（前端不要自己算）
`GET /lottery/today/status` 直接下发 `is_winner` / `can_post` 两个布尔值，
前端两个 tab 都用它。历史 bug：`explore.tsx` 曾用 `draw_date` 和「今天」比日期，
而该接口 18:00 前返回的是前一天那轮，导致中签者在自己发帖窗口的 00:00–18:00
整段时间里「掉签」（抽签页不显示发帖入口，首页却显示表单，两页自相矛盾）。

⚠️ **时间戳一律带 `+08:00` 偏移下发**（`timewin.to_iso_shanghai()`）。
库里存 naive datetime，若直接 `.isoformat()`，前端 dayjs 会按设备本地时区解析——
用户手机在东京(UTC+9)就会把 18:00 当成东京时间，倒计时整体偏 1 小时。

⚠️ **`can_post` / 倒计时会随 18:00 边界翻转，前端必须定期重拉**。
两个页面都挂了 60 秒的 `setInterval` 重新拉 `/today/status`，
首页下拉刷新也会同时刷 feed 和抽签状态。否则页面放着过夜后会停在上一轮的状态。

⚠️ **报名按钮不要用 `hasWon` 禁用**：`hasWon` 说的是【当前轮次】中签，
而报名按钮进的是【下一轮】。本轮赢家当然可以报名下一轮，
之前用 `hasWon` 一禁，赢家在自己的发帖窗口里就错过了次日抽签的报名。

### 定时抽签（GitHub Actions）
- 文件：`.github/workflows/daily-lottery.yml`
- Cron：`0 10 * * *`（UTC 10:00 = 北京 18:00）
- 调用：`POST /lottery/run`，携带 `X-Cron-Secret` header 鉴权
- **`/lottery/run` 是幂等的**：该轮已开奖就直接返回既有赢家，绝不重抽。
  重抽会让已发帖的赢家失去发帖权、新赢家又因 `publish_date` 已存在而发不出来。
- **`CRON_SECRET` 未配置时返回 503（fail-closed）**。曾写成 `if CRON_SECRET and ...`，
  没配环境变量时鉴权被完全跳过，任何人可裸调重抽赢家。
- 没人报名时返回 200 + `winner_user_id: null` 并落一条 `status='empty'` 的轮次，
  不再抛 400（否则 `curl -f --retry 3` 会把 workflow 标红，属误报警）
- ⚠️ **`server/app/scheduler.py` 已废弃且不得再启用**。它曾在 `main.py` 的 lifespan 里
  被启动，与 cron 同时在 18:00 抽签 → 两次抽出不同赢家、后一次覆写。多实例还会各跑一次。

### 数据库迁移
- 使用 Alembic，systemd 启动 uvicorn 时自动执行
- 当前版本链：`741c3de4a7ff`（add likes favorites）→ `a1b2c3d4e5f6`（add avatar to users）
  → `b7e2f4c81a03`（tickets/posts 唯一约束）
- `main.py` 启动逻辑：检查 `alembic_version` 是否存在，不存在先 `stamp 741c3de4a7ff` 再 `upgrade head`
- ⚠️ `Base.metadata.create_all()` **只建不存在的表，不会给已有表加约束**，
  所以新增唯一约束必须写迁移

### 核心不变量（都有数据库约束兜底）
| 规则 | 约束 |
|------|------|
| 一天只能有一帖 | `posts.publish_date` UNIQUE |
| 一人一轮只能一张票 | `tickets (user_id, draw_date)` UNIQUE |
| 一人一帖只能赞/藏一次 | `post_likes` / `post_favorites (user_id, post_id)` UNIQUE |

仅靠应用层「先查再插」在并发/连点下会被击穿，所以三条都加了 DB 约束，
接口捕获 `IntegrityError` 转成 400（点赞/收藏则视作「已是开启态」返回 200，不漏成 500）。

### 接口不下发的字段
`GET /lottery/tickets` **不返回参与者手机号**（该接口所有登录用户可见，
前端只用 `name`/`avatar` 画头像）。它现在也需要登录才能调。

### 随机昵称
- 文件：`server/app/nicknames.py`
- 100 个形容词 × 100 个名词 = 10,000 种组合
- 注册时若未传 `name` 自动调用 `generate_nickname()`

---

## 数据库模型（主要字段）

| 表 | 关键字段 |
|----|---------|
| users | id, phone, name, avatar |
| posts | id, author_id, title, content, media_url, publish_date |
| post_images | id, post_id, url, width, height, sort |
| post_likes | id, post_id, user_id |
| post_favorites | id, post_id, user_id |
| tickets | id, user_id, draw_date |
| lottery | id, draw_date, winner_user_id, status |

---

## 环境变量

### 后端（ECS：/etc/onedayapost.env，权限 600）
```
DATABASE_URL=mysql+pymysql://...
JWT_SECRET=...
CRON_SECRET=...
ALIYUN_OSS_BUCKET=onedayapost-media   # 旧名 one-post-a-day 已被他人占用
ALIYUN_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
CORS_ORIGINS=https://onedayapost.fun
ALIYUN_ACCESS_KEY_ID=...
ALIYUN_ACCESS_KEY_SECRET=...
ALIYUN_OSS_ROLE_ARN=...   # 注意变量名是 OSS 不是 STS，代码读的是这个
```

### GitHub Actions Secrets
```
API_BASE_URL=https://api.onedayapost.fun
CRON_SECRET=（必须与 /etc/onedayapost.env 里的一致，否则抽签 503）
```
（workflow 也兼容旧名 `RAILWAY_API_URL`，完整配置说明见 `server/.env.example`）

---

## 待完成 / 已知问题

| 事项 | 状态 | 说明 |
|------|------|------|
| 删掉主账号 AK/SK | **建议** | 排查阿里云配置时用主账号密钥调过 RAM/OSS/PNVS API。现已全部改用子用户 `odau-customer-user`（最小权限），主账号密钥可以删了 |
| 图片缓存 | 待做 | expo-image 加 `cachePolicy="memory-disk"` |
| sessions 表只写不读 | 待做 | `auth.py` 写入 session 但从不校验，logout 无法吊销 token（`deps.py` 只验 JWT 签名）。要支持强制下线需改成查库 |
| OTP 存内存 | 待做 | `OTP_STORE`/`RATE_LIMIT` 是进程内 dict，重启即失效、多 worker 不共享（限流可被绕过）。多实例需换 Redis |
| Feed 分页 | 部分完成 | 后端已支持 `?limit=&offset=`（默认 50、上限 100），前端还没接无限滚动 |

---

## 后端部署（香港/境外 VPS）

**背景**：Railway 上的应用已删除（数据库随之丢失），前端仍在 Vercel。
后端需要重新部署。选香港/境外的理由：无需备案，且相比美东延迟明显更低。

⚠️ 部署脚本只依赖 Ubuntu 22.04 + Python + MySQL + nginx，**不绑定阿里云**。
换成腾讯云/Vultr/Hetzner 等任何 VPS 都能直接用，可按价格自由选。

**架构**：前端 Vercel（onedayapost.fun）→ 后端 ECS（api.onedayapost.fun）→ 本机 MySQL + 阿里云 OSS。
⚠️ 与旧方案不同：**nginx 只反代 API，不再 serve 前端**（前端由 Vercel 托管）。

### 当前部署（2026-07-29 已上线）

| 项 | 值 |
|----|-----|
| 服务器 | 阿里云轻量香港 `47.243.211.168`，Ubuntu 22.04，2vCPU / 1.6G |
| 登录用户 | `admin`（免密 sudo），SSH 密钥认证 |
| 代码目录 | `/opt/onedayapost`（www-data 所有） |
| 环境变量 | `/etc/onedayapost.env`（权限 600，**不在代码目录、不进 git**） |
| 服务 | `systemctl {status,restart} onedayapost-api`，日志 `journalctl -u onedayapost-api -f` |
| 证书 | Let's Encrypt，至 2026-10-26，certbot 自动续期 |
| 小内存调优 | 2G swapfile（swappiness=10）+ `/etc/mysql/mysql.conf.d/zz-small-memory.cnf`（缓冲池 64M） |

**更新后端代码**：`./deploy/push-code.sh`（rsync + 自动重启 + 验 /health）
**排查阿里云配置**：`ssh admin@47.243.211.168 'cd /opt/onedayapost/server && sudo /opt/onedayapost/venv/bin/python scripts/check_aliyun.py /etc/onedayapost.env'`

### 部署资产
| 文件 | 用途 |
|------|------|
| `deploy/setup-ecs.sh` | 服务器初始化脚本，幂等可重复运行（Ubuntu 22.04） |
| `deploy/api.nginx.conf` | nginx 反代配置（只代理 API） |
| `deploy/onedayapost-api.service` | systemd 单元 |

### 步骤
1. 买一台香港/境外的 2核2G Ubuntu 22.04 服务器
   （价格以控制台实时报价为准，不同厂商与套餐差异很大；本项目对配置要求不高）
2. `scp deploy/setup-ecs.sh root@<公网IP>:~/ && ssh root@<公网IP> 'bash setup-ecs.sh'`
   脚本会：装依赖 → 建库建用户（随机密码）→ 拉代码 → 装 Python 包 →
   生成 `/etc/onedayapost.env`（随机 JWT/CRON_SECRET，权限 600）→ 注册 systemd → 配 nginx
3. 编辑 `/etc/onedayapost.env`，把本地 `server/.env` 里的阿里云那几项抄进去
4. `systemctl start onedayapost-api` && `curl localhost:4000/health`
5. DNS 加 `api.onedayapost.fun` A 记录指向服务器公网 IP
6. **解析生效后**再 `certbot --nginx -d api.onedayapost.fun`（顺序反了会签发失败）
7. 安全组放行 80/443；**不要**放行 3306 和 4000
8. GitHub Actions Secrets 配 `API_BASE_URL=https://api.onedayapost.fun` 和 `CRON_SECRET`
   （与 `/etc/onedayapost.env` 里的值一致，否则抽签 503）
9. 前端 `app/config/api.ts` 已指向 `api.onedayapost.fun`，重新构建并 push

### 部署时踩过的坑（重建服务器时会再遇到）

| 坑 | 现象 | 处理 |
|----|------|------|
| 默认用户不是 root | 轻量服务器默认用户是 `admin`（ubuntu 机型可能是 `ubuntu`），脚本原来的 `[[ $EUID -eq 0 ]] \|\| exit 1` 直接退出 | 脚本已改为非 root 时自动 `exec sudo` 重跑 |
| `mkswap -q` | Ubuntu 22.04 的 util-linux 不支持 `-q`，建 swap 那步报错中断 | 改用输出重定向静音 |
| `http2 on;` | 那是 nginx 1.25+ 的独立指令，Ubuntu 22.04 自带 1.18，遇到会报 unknown directive 并**拒绝启动** | 改回 `listen 443 ssl http2;` |
| certbot 造成重定向死循环 | 证书未签发时配置里只有 HTTP 段，`certbot --nginx` 把 443 监听插进了那个「无条件 301 跳 HTTPS」的 server 块，于是 HTTPS 也被 301 到 HTTPS | 签发证书后重新装回仓库里的完整配置 |
| systemd 段放错 | `StartLimitIntervalSec` / `StartLimitBurst` 属于 `[Unit]` 段，写在 `[Service]` 会被忽略并打 "Unknown key name" | 已移到 `[Unit]` |
| `$USER` 变量冲突 | `push-code.sh` 里 `${USER:-admin}` 拿到的是**本机登录用户名**（`USER` 是 shell 内置变量），SSH 用错账号 | 改用 `SSH_USER` |

### 短信 UNKNOWN 的教训（重要）

`SendSmsVerifyCode` 对**无法送达的号码**一律返回 `code=UNKNOWN / message=UNKNOWN`，
不给任何细节。用非法号码（`00000000000`）或未分配号段（`13000000000`）测试时，
**无论配置对错都是 UNKNOWN**。

曾据此误判为「融合认证未开通」、「签名与模板不配套」、「账号下 0 个签名」，
实际配置从头到尾都是好的——换真实手机号一测就 `code=OK`。

两个容易误导的点：
- `QuerySmsSignList`（短信服务接口）返回 0 个签名是**正常的**：
  赠送签名不属于自建签名，不在该接口返回范围内
- 控制台「赠送签名配置」里审核状态「通过」的签名可以直接用，
  搭配赠送模板 `100001`（变量 `code` + `min`）

**所以：短信配置是否可用，只能用真实手机号验证。**
`scripts/check_aliyun.py` 已改为只做静态检查并给出验证命令，不再据此判红。

### 数据库是空的
Railway 数据库已随应用删除，**没有历史数据要迁移**。这反而省掉两件麻烦事：
不需要导出/导入 dump，也不需要跑清理重复数据的迁移。
空库启动时 `main.py` 会检测到并直接 `stamp` 到 head（该路径已在真实 MySQL 上验证）。

### 单 worker 的原因
systemd 里 uvicorn 不加 `--workers`，因为：
- `OTP_STORE` / `RATE_LIMIT` 是进程内 dict，多 worker 不共享，验证码限流会被绕过
- alembic 迁移在启动时执行，多 worker 会并发跑同一份迁移

要上多 worker，得先把这两个搬到 Redis。

---

## 项目文件结构

```
one-post-a-day/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx       # 首页（登录 + Feed）
│   │   ├── explore.tsx     # 抽签页
│   │   └── profile.tsx     # 个人主页
│   ├── _layout.tsx         # 根布局
│   ├── config/api.ts       # API_BASE 配置
│   └── context/            # AuthContext, LotteryContext
├── components/
│   └── ui/icon-symbol.tsx  # lucide 图标封装
├── constants/
│   └── design-system.ts    # 设计系统（色彩/字体/间距）
├── hooks/
│   └── use-app-insets.ts   # 顶部安全区 hook
├── scripts/
│   └── inject-fonts.js     # 构建后处理脚本
├── server/
│   ├── app/
│   │   ├── auth.py         # 登录/OTP
│   │   ├── lottery.py      # 抽签
│   │   ├── post.py         # 发帖/Feed
│   │   ├── profile.py      # 个人主页
│   │   ├── upload.py       # OSS 上传 STS
│   │   ├── scheduler.py    # APScheduler（已弃用，改用 GitHub Actions）
│   │   ├── nicknames.py    # 随机昵称词库
│   │   ├── models.py       # SQLAlchemy 模型
│   │   └── schemas.py      # Pydantic schemas
│   ├── alembic/versions/   # 数据库迁移
│   ├── main.py             # FastAPI 入口
│   └── requirements.txt
├── dist/                   # 前端构建产物（git 追踪）
├── deploy/                 # 香港 ECS 部署资产
│   ├── setup-ecs.sh        # 服务器初始化（幂等）
│   ├── api.nginx.conf      # nginx 只反代 API
│   └── onedayapost-api.service
├── .github/workflows/
│   └── daily-lottery.yml   # 每日 18:00 抽签
├── vercel.json
└── PROJECT_STATUS.md
```
