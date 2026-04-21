import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

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
        ],
        // No providerImportSource — MDX files receive `components`
        // directly as a prop from BlogPost when rendered.
      }),
    },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    {
      name: 'security-headers',
      configureServer(server) {
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
      },
    },
  },
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.warn', 'console.info', 'console.debug', 'console.trace'],
    legalComments: 'none',
  },
})
