import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Content-Security-Policy: o navegador só executa scripts do próprio sistema e só se conecta ao
// Supabase e ao ViaCEP. Se algum dia entrar HTML malicioso na página, ele não consegue carregar
// scripts de fora nem enviar a sessão para outro servidor.
// Vai como meta tag apenas no build: o modo de desenvolvimento do Vite usa
// scripts embutidos que a política bloquearia.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const politicaSeguranca = (): Plugin => ({
  name: 'montec-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    politicaSeguranca(),
  ],
  base: './',
})
