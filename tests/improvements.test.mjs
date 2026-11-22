import test from 'node:test'
import assert from 'node:assert/strict'
import { createLeaderboardReader, parseLeaderboard } from '../server/community.mjs'
import { validateJudgement } from '../server/semantic.mjs'

function homepageHtml() {
  const data = {
    initialSkills: [
      { source: 'owner/repo', skillId: 'example', name: 'Example', installs: 123, weeklyInstalls: [4, 5] },
      { source: 'owner/other', skillId: 'second', name: 'Second', installs: 42, weeklyInstalls: [1, 2] },
    ],
    totalSkills: 2,
    allTimeTotal: 165,
    view: 'all-time',
  }
  const payload = '53:["$","$L61",null,' + JSON.stringify(data) + ']'
  return '<script>self.__next_f.push([1,' + JSON.stringify(payload) + '])</script>'
}

test('community ranking retains upstream order and source metrics', () => {
  const payload = 'x:' + JSON.stringify({initialSkills:[{source:'owner/repo',skillId:'example',name:'Example',installs:123}],totalSkills:1,view:'all-time'})
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(payload) + '])</script>'
  const result = parseLeaderboard(html)
  assert.equal(result.totalSkills, 1)
  assert.equal(result.skills[0].installs, 123)
  assert.equal(result.skills[0].url, 'https://www.skills.sh/owner/repo/example')
})

test('community reader uses the canonical public host and parses homepage data', async () => {
  const requests = []
  const reader = createLeaderboardReader({
    fetcher: async (url, options) => {
      requests.push({ url: String(url), redirect: options.redirect })
      return new Response(homepageHtml(), { status: 200 })
    },
    now: () => 1000,
  })

  const result = await reader()

  assert.deepEqual(requests, [{ url: 'https://www.skills.sh/', redirect: 'error' }])
  assert.equal(result.source, 'https://www.skills.sh/')
  assert.equal(result.totalSkills, 2)
  assert.equal(result.skills[0].installs, 123)
  assert.equal(result.stale, false)
})

test('community reader serves its last result as stale after upstream failure', async () => {
  let now = 1000
  let fail = false
  let requests = 0
  const reader = createLeaderboardReader({
    fetcher: async () => {
      requests++
      if (fail) throw new Error('network unavailable')
      return new Response(homepageHtml(), { status: 200 })
    },
    now: () => now,
  })

  const fresh = await reader()
  now += 60 * 60 * 1000 + 1
  fail = true
  const stale = await reader()

  assert.equal(requests, 2)
  assert.equal(stale.stale, true)
  assert.deepEqual(stale.skills, fresh.skills)
})

test('community cache stays fresh for one hour and exposes cached data without fetching', async () => {
  let now = 1000
  let requests = 0
  const reader = createLeaderboardReader({
    fetcher: async () => { requests++; return new Response(homepageHtml()) },
    now: () => now,
  })

  const first = await reader()
  now += 59 * 60 * 1000
  assert.equal((await reader.cached()).fetchedAt, first.fetchedAt)
  assert.equal(requests, 1)
  now += 60 * 60 * 1000 - (59 * 60 * 1000) + 1
  await reader.refresh()
  assert.equal(requests, 2)
})

test('semantic analysis rejects missing dimensions and invented line evidence', () => {
  assert.throws(() => validateJudgement({dimensions:[]}, 'one\ntwo'), /六个维度/)
  const ids=['clarity','execution','safety','efficiency','portability','maintenance']
  const data={dimensions:ids.map(id=>({id,score:70,reason:'依据',evidenceLines:[9],suggestion:'建议'}))}
  assert.throws(() => validateJudgement(data, 'one\ntwo'), /行号/)
})
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.mjs'

test('semantic analysis sends a bounded request and persists validated results', async () => {
  const ids=['clarity','execution','safety','efficiency','portability','maintenance']
  const model=createServer((request,response) => {
    let body=''
    request.on('data', chunk => body+=chunk)
    request.on('end', () => {
      const parsed=JSON.parse(body)
      assert.equal(parsed.model,'test-model')
      assert.match(parsed.messages[1].content,/资料/)
      response.setHeader('content-type','application/json')
      response.end(JSON.stringify({choices:[{message:{content:JSON.stringify({dimensions:ids.map(id=>({id,score:70,reason:'需要核查',suggestion:'补充细节',evidenceLines:[1]}))})}}]}))
    })
  }).listen(0,'127.0.0.1')
  await new Promise(resolve=>model.once('listening',resolve))
  const dir=await mkdtemp(join(tmpdir(),'skillscope-semantic-'))
  const env={SKILLSCOPE_LLM_BASE_URL:`http://127.0.0.1:${model.address().port}/v1`,SKILLSCOPE_LLM_MODEL:'test-model',SKILLSCOPE_LLM_API_KEY:'test-key'}
  const {app}=await createApp({dataDir:dir,seed:false,semanticEnv:env})
  const server=app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  try {
    const created=await fetch(base+'/api/evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'---\nname: sample\ndescription: a sample skill for testing\n---\n# Sample'})}).then(r=>r.json())
    const response=await fetch(base+'/api/skills/'+created.id+'/semantic',{method:'POST'})
    assert.equal(response.status,200)
    const updated=await response.json()
    assert.equal(updated.semantic.dimensions.length,6)
    assert.equal(updated.semantic.dimensions[0].evidence[0].text,'---')
    const saved=await fetch(base+'/api/skills/'+created.id).then(r=>r.json())
    assert.equal(saved.semantic.model,'test-model')
  } finally { await new Promise(resolve=>server.close(resolve)); await new Promise(resolve=>model.close(resolve)); await rm(dir,{recursive:true,force:true}) }
})
