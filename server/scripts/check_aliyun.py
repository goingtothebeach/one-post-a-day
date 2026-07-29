#!/usr/bin/env python
"""逐项探测阿里云配置是否可用。每配完一步就跑一次，能立刻知道通没通。

用法（在 server/ 目录下）：
    ./.venv/bin/python scripts/check_aliyun.py            # 读 .env
    ./.venv/bin/python scripts/check_aliyun.py .env.prod  # 读指定文件

不会真发短信、不产生费用：短信那步用非法号码探测，
鉴权与产品开通状态的错误会先于参数校验返回，足够判断通不通。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values

OK, FAIL, SKIP = "\033[32m✓\033[0m", "\033[31m✗\033[0m", "\033[33m—\033[0m"


def line(mark: str, name: str, detail: str = "") -> None:
    print(f"  {mark} {name}" + (f"  {detail}" if detail else ""))


def hint(text: str) -> None:
    print(f"      → {text}")


def main() -> int:
    env_file = sys.argv[1] if len(sys.argv) > 1 else ".env"
    v = dotenv_values(env_file)
    if not v:
        print(f"读不到 {env_file}")
        return 1
    print(f"\n配置来源: {env_file}\n")

    ak = v.get("ALIYUN_ACCESS_KEY_ID")
    sk = v.get("ALIYUN_ACCESS_KEY_SECRET")
    role = v.get("ALIYUN_OSS_ROLE_ARN")
    bucket = v.get("ALIYUN_OSS_BUCKET")
    endpoint = v.get("ALIYUN_OSS_ENDPOINT", "oss-cn-beijing.aliyuncs.com")
    failures = 0

    # ---- 1. 变量是否齐全 ----
    print("【1】环境变量")
    required = {
        "ALIYUN_ACCESS_KEY_ID": ak,
        "ALIYUN_ACCESS_KEY_SECRET": sk,
        "ALIYUN_OSS_ROLE_ARN": role,
        "ALIYUN_OSS_BUCKET": bucket,
        "JWT_SECRET": v.get("JWT_SECRET"),
        "CRON_SECRET": v.get("CRON_SECRET"),
        "DATABASE_URL": v.get("DATABASE_URL"),
    }
    for k, val in required.items():
        if val:
            line(OK, k)
        else:
            line(FAIL, k, "未设置")
            failures += 1
    if bucket == "one-post-a-day":
        line(FAIL, "ALIYUN_OSS_BUCKET", "这个名字已被其他账号占用，必须换")
        failures += 1

    # ---- 2. AK/SK 是否有效 ----
    print("\n【2】访问密钥 AK/SK")
    if not (ak and sk):
        line(SKIP, "跳过（缺少 AK/SK）")
    else:
        try:
            from alibabacloud_sts20150401.client import Client as Sts
            from alibabacloud_tea_openapi.models import Config

            cfg = Config(access_key_id=ak, access_key_secret=sk)
            cfg.endpoint = "sts.aliyuncs.com"
            body = Sts(cfg).get_caller_identity().body
            idt = str(body.identity_type)
            line(OK, "有效", f"账号 ...{str(body.account_id)[-4:]} / {idt}")
            if idt == "Account":
                hint("这是【主账号】密钥。阿里云不允许主账号调 AssumeRole，")
                hint("所以图片上传必然失败——需要改用 RAM 子用户的密钥。")
        except Exception as e:
            s = str(e)
            line(FAIL, "无效")
            failures += 1
            if "Inactive" in s:
                hint("密钥被禁用，去 RAM 控制台启用，或新建一个 RAM 用户")
            elif "NotFound" in s:
                hint("密钥不存在，可能已删除")
            elif "SignatureDoesNotMatch" in s:
                hint("SK 与 AK 不匹配")
            else:
                hint(s[:150])

    # ---- 3. STS AssumeRole（图片上传依赖）----
    print("\n【3】STS AssumeRole（图片上传）")
    if not (ak and sk and role):
        line(SKIP, "跳过（缺少 AK/SK 或 ROLE_ARN）")
    else:
        try:
            from alibabacloud_sts20150401.client import Client as Sts
            from alibabacloud_sts20150401 import models as sm
            from alibabacloud_tea_openapi.models import Config

            cfg = Config(access_key_id=ak, access_key_secret=sk)
            cfg.endpoint = "sts.aliyuncs.com"
            Sts(cfg).assume_role(
                sm.AssumeRoleRequest(
                    role_arn=role, role_session_name="probe", duration_seconds=900
                )
            )
            line(OK, "可以换取临时凭证")
        except Exception as e:
            s = str(e)
            line(FAIL, "失败")
            failures += 1
            if "may not be assumed by root" in s:
                hint("主账号不能 AssumeRole（阿里云的硬限制，改权限也没用）。")
                hint("需要：RAM 控制台 → 用户 → 创建【子用户】并勾选永久 AccessKey，")
                hint("给它 AliyunSTSAssumeRoleAccess 权限，然后用子用户的 AK/SK 替换。")
            elif "EntityNotExist.Role" in s:
                hint("角色不存在，检查 ROLE_ARN 是否写对")
            elif "NoPermission" in s or "Forbidden" in s:
                hint("RAM 用户缺少 AliyunSTSAssumeRoleAccess 权限，或角色信任策略没允许该用户")
            elif "Inactive" in s or "NotFound" in s:
                hint("先解决上一步的密钥问题")
            else:
                hint(s[:150])

    # ---- 4. OSS bucket ----
    # 判断依据必须是「匿名能不能读到一个对象」，而不是能不能列举 bucket。
    # 列举需要 ListObject 权限，公开读的 bucket 匿名列举照样 403，
    # 用列举来判断会把配置正常的 bucket 误报成异常。
    print("\n【4】OSS Bucket")
    if not bucket:
        line(SKIP, "跳过（未配置 bucket）")
    else:
        import urllib.error
        import urllib.request

        probe = f"https://{bucket}.{endpoint}/__health_probe_not_exist__"
        try:
            urllib.request.urlopen(probe, timeout=12)
            line(OK, "可公开读")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "ignore")
            if "NoSuchBucket" in raw:
                line(FAIL, "bucket 不存在", "需要先创建")
                failures += 1
            elif "does not belong to you" in raw:
                line(FAIL, "名字被其他账号占用", "必须改用别的名字")
                failures += 1
            elif "NoSuchKey" in raw:
                # 能读到「对象不存在」= 匿名读权限正常，正是我们要的
                line(OK, "存在且可公开读")
            elif "bucket acl" in raw or e.code == 403:
                line(FAIL, "不可公开读", "feed 里的图会裂")
                failures += 1
                hint("先看读写权限是否为「公开读」。")
                hint("若 ACL 已是 public-read 仍 403，是「阻止公共访问」开着——")
                hint("它会盖过 ACL，此时改 ACL 会报 'Put public bucket acl is not allowed'。")
                hint("去 Bucket → 数据安全 → 阻止公共访问，关掉它。")
            else:
                line(FAIL, f"HTTP {e.code}", raw[:100])
                failures += 1
        except Exception as e:
            line(FAIL, "无法访问", str(e)[:120])
            failures += 1

    # ---- 5. 短信（号码认证服务）----
    # 这一项【无法在不真发短信的前提下确诊】。
    # 教训：用非法号码（00000000000）或未分配号段（13000000000）探测时，
    # 接口一律返回 code=UNKNOWN——因为运营商无法送达、回执失败。
    # 这个 UNKNOWN 与「配置错误」的 UNKNOWN 无法区分，
    # 曾据此误判成「融合认证未开通 / 签名模板不配套」，实际配置是好的。
    # 所以这里只做静态检查，真实性验证请用真实手机号手动跑一次。
    print("\n【5】短信 / 号码认证服务 PNVS")
    if v.get("DEV_FAKE_OTP") == "1":
        line(SKIP, "本地模式 DEV_FAKE_OTP=1，验证码固定 123456，无需短信服务")
    else:
        sign = v.get("ALIYUN_SMS_SIGN_NAME")
        tpl = v.get("ALIYUN_SMS_TEMPLATE_CODE")
        if not (sign and tpl):
            line(FAIL, "缺少签名或模板", "ALIYUN_SMS_SIGN_NAME / ALIYUN_SMS_TEMPLATE_CODE")
            failures += 1
        else:
            line(OK, "签名与模板已配置", f"{sign} / {tpl}")
            hint("注意：签名必须来自控制台「赠送签名配置」页，")
            hint("且必须搭配【赠送模板】使用（自定义签名会被运营商拒发）。")
            hint("是否真能送达只能用【真实手机号】验证——非法号码一律返回 UNKNOWN：")
            hint(f'  curl -X POST https://api.onedayapost.fun/auth/request-otp \\')
            hint(f'    -H "Content-Type: application/json" -d \'{{"phone":"你的手机号"}}\'')

    # ---- 6. 数据库 ----
    print("\n【6】数据库")
    dburl = v.get("DATABASE_URL")
    if not dburl:
        line(SKIP, "跳过（未配置）")
    else:
        try:
            from sqlalchemy import create_engine, text

            eng = create_engine(dburl, pool_pre_ping=True)
            with eng.connect() as c:
                n = c.execute(
                    text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
                ).scalar()
            host = dburl.split("@")[-1].split("/")[0] if "@" in dburl else "local"
            line(OK, "可连接", f"{host}，{n} 张表")
        except Exception as e:
            line(FAIL, "连不上", str(e)[:130])
            failures += 1

    print()
    if failures:
        print(f"还有 {failures} 项待解决\n")
        return 1
    print("全部通过，可以启动服务了\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
