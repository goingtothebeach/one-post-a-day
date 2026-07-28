// 生产环境 API 地址。
// Railway 上的旧部署已删除，后端迁到阿里云香港 ECS，走 api 子域。
// 可用 EXPO_PUBLIC_API_BASE 覆盖（构建时注入），便于连预发或临时环境。
const PRODUCTION_API = 'https://api.onedayapost.fun';

// 开发环境：本地 uvicorn（cd server && uvicorn main:app --reload --port 4000）
const DEV_API = 'http://localhost:4000';

export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_API : DEV_API);
