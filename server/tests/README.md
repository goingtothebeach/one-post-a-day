# 后端测试

## 跑法

httpx 只在测试时需要，**不在 requirements.txt 里**（不该装到生产）：

```
cd server
venv/bin/pip install httpx        # 首次
PYTHONPATH=. venv/bin/python tests/test_auth_flow.py
```

## test_auth_flow.py

覆盖 token 的完整生命周期。用临时 sqlite 库，**不碰生产数据**，
也不发真短信（`DEV_FAKE_OTP=1` 让 request-otp 直接回验证码）。

9 项断言里最重要的三条，都是曾经真的坏过或差点坏的：

1. **登出后 token 立即失效** —— `sessions` 表以前只写不读，登出只清客户端，
   那张 token 在剩余 7 天里仍然可用。
2. **续期后旧 token 立即失效** —— 否则每次续期都留下一张仍然有效的旧票。
3. **过期 token 不能靠 `/auth/refresh` 复活** —— 否则等于永不过期的登录态。

另外 4 号断言当初就是靠这个脚本抓出来的：payload 只有 `sub`+`exp` 时，
同一用户同一秒签发两次会得到完全相同的字符串，撞 `sessions.token` 唯一约束 → 500。
现在 payload 带 `jti` 随机串。
