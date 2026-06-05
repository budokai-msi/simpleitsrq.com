import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGeneratedPostCleanup from './scripts/remark-generated-post-cleanup.mjs'
import remarkCityAutolink from './scripts/remark-city-autolink.mjs'
import { Buffer } from 'node:buffer'

export default defineConfig({
  plugins: [
    // MDX must run before @vitejs/plugin-react so the resulting JSX
    // still passes through React Fast Refresh in dev.
    // remark-frontmatter parses the --- YAML block; remark-mdx-frontmatter
    // re-exports it as a named `frontmatter` export so BlogPost.jsx can
    // read it directly off the lazy-loaded module.
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [
          remarkFrontmatter,
          [remarkMdxFrontmatter, { name: 'frontmatter' }],
          // Some generated news posts arrived with markdown headings and
          // shortcodes embedded inside a single paragraph. Normalize that
          // shape at compile time so readers get scannable articles and
          // affiliate/tool tokens render as real components.
          remarkGeneratedPostCleanup,
          // Auto-link the first occurrence of each city name in every
          // post body to its city landing page. Compile-time so links
          // ship as real <a> tags in the rendered HTML — no JS required
          // for crawlers. Posts can opt out via `noCityAutolink: true`
          // in frontmatter.
          remarkCityAutolink,
        ],
        // No providerImportSource — MDX files receive `components`
        // directly as a prop from BlogPost when rendered.
      }),
    },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    {
      name: 'security-headers',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '/', 'http://localhost');
          if (url.pathname === '/api/track') {
            if (req.method === 'POST' || req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.setHeader('Cache-Control', 'no-store');
              res.end();
              return;
            }
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
            return;
          }

          if (url.pathname !== '/api/leadgen') return next();

          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', async () => {
            try {
              const mod = await import('./api/leadgen.js');
              const handler = mod[req.method || 'GET'];
              if (!handler) {
                res.statusCode = 405;
                res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
                return;
              }

              const body = ['GET', 'HEAD'].includes(req.method || 'GET')
                ? undefined
                : Buffer.concat(chunks);
              const request = new Request(`http://localhost${req.url}`, {
                method: req.method,
                headers: req.headers,
                body,
                ...(body ? { duplex: 'half' } : {}),
              });
              const response = await handler(request);
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, error: 'dev_api_failed', message: String(err?.message || err) }));
            }
          });
        });
        server.middlewares.use((_req, res, next) => {
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
          next();
        });
      },
    },
  ],
  server: {
    port: 3000,
    strictPort: true,
  },

  // --- Production hardening ---
  build: {
    // Strip console.*, debugger, and source hint comments.
    target: 'es2022',
    minify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Anonymize chunk filenames — no component/page names exposed.
        chunkFileNames: 'assets/c-[hash].js',
        entryFileNames: 'assets/e-[hash].js',
        assetFileNames: 'assets/a-[hash][extname]',
        // Split heavy / stable vendors so route bundles stay tiny and
        // the browser cache survives feature deploys. Hash-rotation
        // only happens when the underlying lib version changes.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'v-router';
          if (id.includes('lucide-react')) return 'v-icons';
          if (id.includes('framer-motion')) return 'v-motion';
          if (id.includes('react-dom')) return 'v-react-dom';
          if (id.match(/[\\/]react[\\/]/)) return 'v-react';
          if (id.includes('@mdx-js') || id.includes('mdx')) return 'v-mdx';
          if (id.includes('recharts') || id.includes('d3-')) return 'v-charts';
          return 'v-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.warn', 'console.info', 'console.debug', 'console.trace'],
    legalComments: 'none',
  },
})
