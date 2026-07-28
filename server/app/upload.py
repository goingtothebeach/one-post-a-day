import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from .deps import get_current_user

router = APIRouter(prefix="/upload", tags=["upload"])

ROLE_ARN = os.getenv("ALIYUN_OSS_ROLE_ARN")
AK = os.getenv("ALIYUN_ACCESS_KEY_ID")
SK = os.getenv("ALIYUN_ACCESS_KEY_SECRET")
# 不再给 bucket 兜默认值：旧的 one-post-a-day 已被其他账号占用（OSS 名字全局唯一），
# 写死默认值会让配置缺失时静默指向别人的 bucket。缺失就直接报错更安全。
BUCKET = os.getenv("ALIYUN_OSS_BUCKET")
ENDPOINT = os.getenv("ALIYUN_OSS_ENDPOINT", "oss-cn-beijing.aliyuncs.com")
DURATION = int(os.getenv("ALIYUN_OSS_STS_DURATION", "3600"))

@router.get("/credentials")
def credentials(user=Depends(get_current_user)):
    missing = [
        n
        for n, v in (
            ("ALIYUN_OSS_ROLE_ARN", ROLE_ARN),
            ("ALIYUN_ACCESS_KEY_ID", AK),
            ("ALIYUN_ACCESS_KEY_SECRET", SK),
            ("ALIYUN_OSS_BUCKET", BUCKET),
        )
        if not v
    ]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"upload not configured: missing {', '.join(missing)}",
        )
    try:
        from alibabacloud_sts20150401.client import Client as StsClient
        from alibabacloud_tea_openapi.models import Config
        from alibabacloud_sts20150401 import models as sts_models

        config = Config(access_key_id=AK, access_key_secret=SK)
        config.endpoint = "sts.aliyuncs.com"
        client = StsClient(config)

        request = sts_models.AssumeRoleRequest(
            role_arn=ROLE_ARN,
            role_session_name=f"onepost-{user.id}",
            duration_seconds=DURATION,
        )
        response = client.assume_role(request)
        creds = response.body.credentials
        key_prefix = f"uploads/{datetime.now().strftime('%Y%m%d')}/{uuid.uuid4().hex}"
        return {
            "access_key_id": creds.access_key_id,
            "access_key_secret": creds.access_key_secret,
            "security_token": creds.security_token,
            "bucket": BUCKET,
            "endpoint": ENDPOINT,
            "key_prefix": key_prefix,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
