import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'Savismartboard',
                short_name: 'Smartboard',
                description: 'Interactive teaching smartboard for Savischools teachers',
                theme_color: '#0f172a',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'landscape',
                start_url: '/dashboard',
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                ],
            },
            workbox: {
                skipWaiting: true,
                clientsClaim: true,
                // App shell — cache all JS/CSS/HTML (precache)
                globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
                // Runtime caching strategies
                runtimeCaching: [
                    {
                        // KBot rendered cards — cache-first (content doesn't change often)
                        urlPattern: /\/api\/smartboard\/kbot\/.+\/render/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'kbot-cards',
                            expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }, // 7 days
                        },
                    },
                    {
                        // API reads — network-first, fall back to cache
                        urlPattern: /\/api\/smartboard\/(sessions|context|classes|subjects|topics)/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-reads',
                            networkTimeoutSeconds: 4,
                            expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }, // 1 day
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:5105',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
