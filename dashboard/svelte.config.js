import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * Static-only build. The whole site is prerendered (see src/routes/+layout.ts),
 * so there is no SSR server and no fallback SPA shell.
 *
 * The /match/[id] route is dynamic and may not be reachable by the crawler in
 * an empty-data build (no fixtures to link to), so we tell the prerenderer to
 * ignore unseen dynamic routes rather than fail the build.
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: undefined, strict: false }),
    prerender: {
      handleUnseenRoutes: 'ignore',
    },
  },
}
