import { Platform } from 'react-native';

// 生产环境API地址（Railway部署）
const PRODUCTION_API = 'https://one-post-a-day-production.up.railway.app';

// 开发环境API地址
const DEV_API = 'http://localhost:4000';

// 根据环境自动切换
export const API_BASE = process.env.NODE_ENV === 'production' ? PRODUCTION_API : DEV_API;
