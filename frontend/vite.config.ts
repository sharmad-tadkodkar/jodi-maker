import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `virtual:avatar-files` → the file stems in public/avatars/ (e.g. "arjun", "avatar-w-3").
 * Lets the app use /avatars/{userId}.webp only when that file exists — a missing public file is served as
 * index.html by both Vite and Firebase (SPA fallback), so probing would download HTML for every user.
 * Dev: adding/removing a file reloads the page with the new list.
 */
function avatarFiles(): Plugin {
  const id = 'virtual:avatar-files'
  const resolved = '\0' + id
  const dir = join(import.meta.dirname, 'public', 'avatars')
  const list = () => {
    try {
      return readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort()
    } catch {
      return []
    }
  }
  return {
    name: 'jodi-avatar-files',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (loadId) => (loadId === resolved ? `export default ${JSON.stringify(list())}` : undefined),
    configureServer(server) {
      server.watcher.add(dir)
      const refresh = (file: string) => {
        if (!file.startsWith(dir)) return
        const mod = server.moduleGraph.getModuleById(resolved)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), avatarFiles()],
})
