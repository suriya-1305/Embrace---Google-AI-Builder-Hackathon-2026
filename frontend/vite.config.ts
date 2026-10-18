import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { Agent } from 'node:https';
import * as tls from 'node:tls';

const certificates = tls as typeof tls & { getCACertificates?: (source: 'default' | 'system') => string[] };
const trustedCertificates = certificates.getCACertificates
  ? [...new Set([...certificates.getCACertificates('default'), ...certificates.getCACertificates('system')])]
  : undefined;

// `npm run build:preview` emits one self-contained HTML file (mock mode) for a
// shareable demo. The normal build emits a standard static site for Firebase Hosting.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'preview' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['..'] }, proxy: {
    '/demo-api': { target: 'https://crysense-baby-api-159523677067.asia-south1.run.app', changeOrigin: true,
      agent: new Agent({ ca: trustedCertificates, rejectUnauthorized: true }),
      rewrite: (path) => path.replace(/^\/demo-api/, ''),
      configure: (proxy) => { proxy.on('error', (_failure, _request, response) => {
        if ('writeHead' in response && !response.headersSent && !response.writableEnded) {
          response.writeHead(502, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ detail: 'Emi could not reach the secure AI service. Check the connection and retry.' }));
        }
      }); },
    },
  } },
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist', sourcemap: mode !== 'preview' },
}));
