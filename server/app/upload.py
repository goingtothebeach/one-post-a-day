import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from .deps import get_current_user
from aliyunsdkcore.client import AcsClient
from aliyunsdksts.request.v20150401 import AssumeRoleRequest

router = APIRouter(prefix="/upload", tags=["upload"])

ROLE_ARN = os.getenv("ALIYUN_OSS_ROLE_ARN")
AK = os.getenv("ALIYUN_ACCESS_KEY_ID")
SK = os.getenv("ALIYUN_ACCESS_KEY_SECRET")
BUCKET = os.getenv("ALIYUN_OSS_BUCKET", "one-post-a-day")
ENDPOINT = os.getenv("ALIYUN_OSS_ENDPOINT", "oss-cn-beijing.aliyuncs.com")
DURATION = int(os.getenv("ALIYUN_OSS_STS_DURATION", "3600"))
REGION = os.getenv("ALIYUN_OSS_REGION", "cn-beijing")

@router.get("/credentials")
def credentials(user=Depends(get_current_user)):
    if not ROLE_ARN or not AK or not SK:
        raise HTTPException(status_code=500, detail="upload not configured")
    client = AcsClient(AK, SK, REGION)
    request = AssumeRoleRequest.AssumeRoleRequest()
    request.set_accept_format('json')
    request.set_RoleArn(ROLE_ARN)
    request.set_RoleSessionName(f"onepost-{user.id}")
    request.set_DurationSeconds(DURATION)
    response = client.do_action_with_exception(request)
    import json
    data = json.loads(response)
    creds = data['Credentials']
    key_prefix = f"uploads/{datetime.now().strftime('%Y%m%d')}/{uuid.uuid4().hex}"
    return {
        "access_key_id": creds['AccessKeyId'],
        "access_key_secret": creds['AccessKeySecret'],
        "security_token": creds['SecurityToken'],
        "bucket": BUCKET,
        "endpoint": ENDPOINT,
        "key_prefix": key_prefix,
      }
