import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 首屏骨架撤掉
const boot = document.getElementById('boot')
if (boot) boot.remove()
