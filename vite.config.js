import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        proxy: {
            '/sofia-api': {
                target: 'http://apisofia.sofiagestionagricola.cl',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sofia-api/, '')
            }
        }
    },
    preview: {
        allowedHosts: ['proyectonatura.onrender.com']
    }
})
