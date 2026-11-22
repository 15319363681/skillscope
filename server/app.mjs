import express from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { evaluateSkill } from './scoring.mjs'
import { importGitHub, parseGitHubSource } from './github.mjs'
import { createStore } from './store.mjs'
import { getLeaderboard } from './community.mjs'
import { evaluateSemantic, semanticStatus, testSemanticConnection, validateSemanticConfig } from './semantic.mjs'

export async function createApp({ dataDir, seed = true, communityFetcher = getLeaderboard, semanticEnv = process.env, semanticTestFetcher = fetch }) {
  const store = await createStore(dataDir, seed)
  let llmConfig = {
    SKILLSCOPE_LLM_BASE_URL: semanticEnv.SKILLSCOPE_LLM_BASE_URL || '',
    SKILLSCOPE_LLM_MODEL: semanticEnv.SKILLSCOPE_LLM_MODEL || '',
    SKILLSCOPE_LLM_API_KEY: semanticEnv.SKILLSCOPE_LLM_API_KEY || '',
  }
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.method !== 'GET' && req.headers.origin) {
      let origin
      try { origin = new URL(req.headers.origin) } catch { return res.status(403).json({ error: '来源无效。' }) }
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) return res.status(403).json({ error: '不允许跨站请求。' })
    }
    next()
  })
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/community', async (_req, res) => {
    try { res.json(await (communityFetcher.cached ? communityFetcher.cached() : communityFetcher())) } catch (error) { res.status(502).json({ error: error.message }) }
  })
  app.get('/api/llm/config', (_req, res) => res.json({
    configured: semanticStatus(llmConfig).configured,
    baseUrl: llmConfig.SKILLSCOPE_LLM_BASE_URL,
    model: llmConfig.SKILLSCOPE_LLM_MODEL,
    hasApiKey: Boolean(llmConfig.SKILLSCOPE_LLM_API_KEY),
  }))
  app.put('/api/llm/config', (req, res) => {
    try {
      const config = validateSemanticConfig({
        baseUrl: req.body?.baseUrl,
        model: req.body?.model,
        apiKey: typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey : llmConfig.SKILLSCOPE_LLM_API_KEY,
      })
      llmConfig = { SKILLSCOPE_LLM_BASE_URL: config.baseUrl, SKILLSCOPE_LLM_MODEL: config.model, SKILLSCOPE_LLM_API_KEY: config.apiKey }
      res.json({ saved: true, configured: true, baseUrl: config.baseUrl, model: config.model, hasApiKey: true })
    } catch (error) { res.status(400).json({ error: error.message }) }
  })
  app.delete('/api/llm/config', (_req, res) => {
    llmConfig = { SKILLSCOPE_LLM_BASE_URL: '', SKILLSCOPE_LLM_MODEL: '', SKILLSCOPE_LLM_API_KEY: '' }
    res.json({ saved: true, configured: false, baseUrl: '', model: '', hasApiKey: false })
  })
  app.post('/api/llm/config/test', async (_req, res) => {
    try { res.json(await testSemanticConnection({
      baseUrl: llmConfig.SKILLSCOPE_LLM_BASE_URL,
      model: llmConfig.SKILLSCOPE_LLM_MODEL,
      apiKey: llmConfig.SKILLSCOPE_LLM_API_KEY,
    }, semanticTestFetcher)) } catch (error) { res.status(400).json({ error: error.message }) }
  })
  app.get('/api/semantic/status', (_req, res) => res.json(semanticStatus(llmConfig)))
  app.post('/api/skills/:id/semantic', async (req, res) => {
    try {
      const report = await store.get(req.params.id)
      if (!report) return res.status(404).json({ error: '没有找到这份报告。' })
      const semantic = await evaluateSemantic(report.content, llmConfig)
      res.json(await store.updateSemantic(req.params.id, semantic))
    } catch (error) { res.status(400).json({ error: error.message || '语义评估失败。' }) }
  })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/skills', async (_req, res) => {
    const skills = await store.list()
    res.json(skills.map(({ content, ...summary }) => summary))
  })
  app.get('/api/skills/:id', async (req, res) => {
    const report = await store.get(req.params.id)
    if (!report) return res.status(404).json({ error: '没有找到这份报告。' })
    res.json(report)
  })
  app.post('/api/import', async (req, res) => {
    if (typeof req.body?.url !== 'string') return res.status(400).json({ error: '请输入 GitHub 链接。' })
    try { res.json(await importGitHub(req.body.url.trim())) }
    catch (error) { res.status(400).json({ error: error.message || '导入失败。' }) }
  })
  app.post('/api/evaluate', async (req, res) => {
    try {
      const content = req.body?.content
      const result = evaluateSkill(content)
      const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : ''
      if (sourceUrl) parseGitHubSource(sourceUrl)
      const category = ['开发工具','研究分析','数据分析','内容创作','效率自动化','其他'].includes(req.body?.category) ? req.body.category : '其他'
      const report = { ...result, id: randomUUID(), content, contentHash: createHash('sha256').update(content).digest('hex'), title: result.name, category, icon: 'code', color: 'lime', isDemo: false, createdAt: new Date().toISOString(), sourceUrl: sourceUrl.slice(0, 2000) }
      const saved = await store.save(report)
      res.status(201).json(saved)
    } catch (error) { res.status(400).json({ error: error.message || '评分失败。' }) }
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }))
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? '请求内容过大。' : '请求无法处理。' }))
  return { app, store }
}
