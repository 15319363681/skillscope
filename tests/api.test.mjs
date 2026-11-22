import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.mjs'

const skill = '---\nname: test-skill\ndescription: Use when generating structured reports from user input.\n---\n# Test Skill\n## Inputs\nInput a task.\n## Workflow\n1. Read input.\n2. Generate output.\n3. Verify output.\n## Safety\nNever expose secrets. Ask for confirmation before writing.'

test('evaluation API persists reports, deduplicates and handles concurrent submissions', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skillscope-test-'))
  const { app } = await createApp({ dataDir, seed: false })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  const post = body => fetch(base + '/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.equal((await fetch(base + '/api/health')).status, 200)
    const response = await post({ content: skill, category: '开发工具' })
    assert.equal(response.status, 201)
    const report = await response.json()
    assert.equal(report.name, 'test-skill')
    assert.equal(report.isDemo, false)
    assert.equal((await (await fetch(base + '/api/skills/' + report.id)).json()).content, skill)
    const duplicate = await (await post({ content: skill })).json()
    assert.equal(duplicate.id, report.id)
    await Promise.all(Array.from({ length: 8 }, (_, index) => post({ content: skill + '\nItem ' + index })))
    assert.equal((await (await fetch(base + '/api/skills')).json()).length, 9)
    const reopened = await createApp({ dataDir, seed: false })
    assert.equal((await reopened.store.list()).length, 9)
    assert.equal((await post({ content: '' })).status, 400)
    assert.equal((await post({ content: 123 })).status, 400)
    assert.equal((await post({ content: skill, sourceUrl: 'javascript:alert(1)' })).status, 400)
    assert.equal((await fetch(base + '/api/skills/missing')).status, 404)
    assert.equal((await fetch(base + '/api/missing')).status, 404)
    const crossOrigin = await fetch(base + '/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ content: skill }) })
    assert.equal(crossOrigin.status, 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('LLM settings stay in memory and never reveal the API key', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skillscope-llm-config-'))
  let testedAuthorization = ''
  const { app } = await createApp({ dataDir, seed: false, semanticEnv: {}, semanticTestFetcher: async (_url, options) => {
    testedAuthorization = options.headers.Authorization
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { headers: { 'Content-Type': 'application/json' } })
  } })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  try {
    const initial = await fetch(base + '/api/llm/config').then(response => response.json())
    assert.equal(initial.configured, false)
    const savedResponse = await fetch(base + '/api/llm/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://llm.example/v1', model: 'example-model', apiKey: 'private-test-key' }),
    })
    assert.equal(savedResponse.status, 200)
    assert.equal((await savedResponse.text()).includes('private-test-key'), false)
    const current = await fetch(base + '/api/llm/config').then(response => response.json())
    assert.deepEqual(current, { configured: true, baseUrl: 'https://llm.example/v1', model: 'example-model', hasApiKey: true })
    assert.equal((await fetch(base + '/api/llm/config/test', { method: 'POST' })).status, 200)
    assert.equal(testedAuthorization, 'Bearer private-test-key')
    assert.equal(JSON.stringify(await (await import('node:fs/promises')).readFile(join(dataDir, 'skills.json'), 'utf8')).includes('private-test-key'), false)
    assert.equal((await fetch(base + '/api/llm/config', { method: 'DELETE' })).status, 200)
    assert.equal((await fetch(base + '/api/llm/config').then(response => response.json())).configured, false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('community API reads the cached leaderboard without triggering an upstream refresh', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skillscope-community-cache-'))
  let readerCalls = 0
  let cacheCalls = 0
  const reader = async () => { readerCalls++; throw new Error('request path must not refresh') }
  reader.cached = async () => { cacheCalls++; return { skills: [], totalSkills: 0, fetchedAt: '2026-01-01T00:00:00.000Z', stale: false } }
  const { app } = await createApp({ dataDir, seed: false, communityFetcher: reader })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/community')
    assert.equal(response.status, 200)
    assert.equal(cacheCalls, 1)
    assert.equal(readerCalls, 0)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dataDir, { recursive: true, force: true })
  }
})
