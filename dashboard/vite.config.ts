import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

// MVP serves at site root. To deploy under a subpath, set BASE_PATH at build
// time and pass it through as build.base in a future iteration.
export default defineConfig({
  plugins: [sveltekit()],
})
