import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// Element Plus 按需引入：只用到的组件才进产物，禁止 import 整个包
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ imports: ['vue', 'vue-router', 'pinia'], resolvers: [ElementPlusResolver()], dts: false }),
    Components({ resolvers: [ElementPlusResolver({ importStyle: 'css' })], dts: false }),
  ],
  server: {
    port: 5180,
    proxy: { '/api': { target: 'http://127.0.0.1:8091', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/element-plus/')) return 'element'
          if (id.includes('/@element-plus/')) return 'el-icons'
          // vue 内核连同 @vue/* 一起归组，别让 shared 单独落进 vendor
          if (id.includes('/@vue/') || id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/')) {
            return 'vue-core'
          }
          return 'vendor'
        },
      },
    },
  },
})
