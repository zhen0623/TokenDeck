import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 打包进 Android WebView 时从 file:// 加载，必须用相对路径，否则白屏
  base: './',
  server: {
    // 0.0.0.0 = 监听所有网卡，同一 WiFi 下手机可访问
    // 只在本机看的话改成 '127.0.0.1'
    host: '0.0.0.0',
    port: 5299,
    strictPort: true,
  },
});
