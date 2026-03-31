import { Buffer } from 'buffer';
import * as CryptoJS from 'crypto-js';
import { Platform } from 'react-native';
import { API_BASE } from '../config/api';

export type StsResponse = {
  access_key_id: string;
  access_key_secret: string;
  security_token: string;
  bucket: string;
  endpoint: string;
  key_prefix: string;
};

export async function getSts(token?: string): Promise<StsResponse> {
  const res = await fetch(`${API_BASE}/upload/credentials`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('sts failed');
  return res.json();
}

export function buildObjectKey(prefix: string, fileName: string) {
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
  return `${prefix}${ext ? '.' + ext : ''}`;
}

export type UploadResult = {
  url: string;
  width?: number;
  height?: number;
};

export function buildPolicy() {
  const expire = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const policyText = {
    expiration: expire,
    conditions: [['content-length-range', 0, 20 * 1024 * 1024]],
  };
  return Buffer.from(JSON.stringify(policyText)).toString('base64');
}

export function buildSignature(secret: string, policyBase64: string) {
  const bytes = CryptoJS.HmacSHA1(policyBase64, secret);
  return CryptoJS.enc.Base64.stringify(bytes);
}

export async function uploadToOss(
  sts: StsResponse,
  key: string,
  file: Blob | { uri: string; type?: string; name?: string }
) {
  const policyBase64 = buildPolicy();
  const signature = buildSignature(sts.access_key_secret, policyBase64);

  const form = new FormData();
  form.append('key', key);
  form.append('OSSAccessKeyId', sts.access_key_id);
  form.append('x-oss-security-token', sts.security_token);
  form.append('policy', policyBase64);
  form.append('Signature', signature);
  form.append('success_action_status', '200');

  if (file instanceof Blob) {
    form.append('file', file);
  } else {
    form.append('file', {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || key.split('/').pop() || 'image.jpg',
    } as any);
  }

  const res = await fetch(`https://${sts.bucket}.${sts.endpoint}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('upload failed');
  return `https://${sts.bucket}.${sts.endpoint}/${key}`;
}
