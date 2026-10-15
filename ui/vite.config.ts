import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 构建产物直接落到 OpenWrt rootfs 覆盖目录
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../files/www/luci-static/yueyue',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/ubus': 'http://192.168.21.1',
      '/cgi-bin': 'http://192.168.21.1',
    },
  },
})
