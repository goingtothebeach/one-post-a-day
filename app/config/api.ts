import { Platform } from 'react-native';

// 默认本机端口 4000；原生端需改为当前电脑局域网 IP
const LAN_IP = process.env.EXPO_PUBLIC_API_HOST || '<YOUR_LAN_IP>';

export const API_BASE = Platform.OS === 'web' ? 'http://localhost:4000' : `http://${LAN_IP}:4000`;
