import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from .deps import get_current_user

router = APIRouter(prefix="/upload", tags=["upload"])

ROLE_ARN = os.getenv("ALIYUN_OSS_ROLE_ARN")
AK = os.getenv("ALIYUN_ACCESS_KEY_ID")
SK = os.getenv("ALIYUN_ACCESS_KEY_SECRET")
BUCKET = os.getenv("ALIYUN_OSS_BUCKET", "one-post-a-day")
ENDPOINT = os.getenv("ALIYUN_OSS_ENDPOINT", "oss-cn-beijing.aliyuncs.com")
DURATION = int(os.getenv("ALIYUN_OSS_STS_DURATION", "3600"))

@router.get("/credentials")
def credentials(user=Depends(get_current_user)):
    if not ROLE_ARN or not AK or not SK:
        raise HTTPException(status_code=500, detail="upload not configured")
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
