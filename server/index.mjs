import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import { createApp } from './app.mjs'
import { getLeaderboard } from './community.mjs'

const project = dirname(dirname(fileURLToPath(import.meta.url)))
const production = process.argv.includes('--production')
const port = Number(process.env.PORT || 4173)
const { app } = await createApp({ dataDir: process.env.SKILLSCOPE_DATA_DIR || join(project, 'data') })
const refreshCommunity = () => getLeaderboard.refresh().catch(error => console.warn('社区榜单更新失败：' + error.message))
void refreshCommunity()
const communityRefreshTimer = setInterval(refreshCommunity, 60 * 60 * 1000)
communityRefreshTimer.unref()
if (production) {
  app.use(express.static(join(project, 'dist')))
  app.use((_req, res) => res.sendFile(join(project, 'dist', 'index.html')))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: project, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}
app.listen(port, '127.0.0.1', () => console.log('SkillScope 已启动：http://127.0.0.1:' + port))
