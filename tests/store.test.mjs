import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { demoSkills } from '../server/demo.mjs'
import { createStore } from '../server/store.mjs'

test('store adds newly introduced demos without replacing user evaluations or duplicating entries', async () => {
  assert.equal(demoSkills().length, 20)
  const dataDir = await mkdtemp(join(tmpdir(), 'skillscope-seed-migration-'))
  const existingDemo = demoSkills()[0]
  const userReport = { id: 'user-report', isDemo: false, title: 'My Skill', content: '# My Skill' }
  await writeFile(join(dataDir, 'skills.json'), JSON.stringify([userReport, existingDemo]))
  try {
    const firstStore = await createStore(dataDir)
    const first = await firstStore.list()
    assert.equal(first.some(item => item.id === userReport.id), true)
    assert.equal(first.length, demoSkills().length + 1)

    const secondStore = await createStore(dataDir)
    const second = await secondStore.list()
    assert.equal(second.length, first.length)
    assert.equal(second.filter(item => item.id === existingDemo.id).length, 1)
    assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'skills.json'), 'utf8')), second)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})
