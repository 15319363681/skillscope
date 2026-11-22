import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { demoSkills } from './demo.mjs'

export async function createStore(dataDir, seed = true) {
  await mkdir(dataDir, { recursive: true })
  const file = join(dataDir, 'skills.json')
  let records
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('评分数据格式无效。')
    records = parsed
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    records = seed ? demoSkills() : []
    await writeFile(file, JSON.stringify(records, null, 2), 'utf8')
  }
  if (seed) {
    const knownIds = new Set(records.map(record => record.id))
    const additions = demoSkills().filter(skill => !knownIds.has(skill.id))
    if (additions.length) {
      const next = [...records, ...additions]
      const temporary = file + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
      await rename(temporary, file)
      records = next
    }
  }
  let pending = Promise.resolve()
  return {
    async list() { await pending; return structuredClone(records) },
    async get(id) { await pending; return structuredClone(records.find(record => record.id === id) ?? null) },
    async updateSemantic(id, semantic) {
      const operation = pending.then(async () => {
        const index = records.findIndex(record => record.id === id)
        if (index < 0) throw new Error('没有找到这份报告。')
        const next = records.slice()
        next[index] = { ...records[index], semantic }
        const temporary = file + '.' + randomUUID() + '.tmp'
        await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
        await rename(temporary, file)
        records = next
        return structuredClone(next[index])
      })
      pending = operation.catch(() => {})
      return operation
    },
    async save(report) {
      const operation = pending.then(async () => {
        const existing = records.find(record => !record.isDemo && record.contentHash === report.contentHash)
        if (existing) return structuredClone(existing)
        const next = [report, ...records]
        const temporary = file + '.' + randomUUID() + '.tmp'
        await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
        await rename(temporary, file)
        records = next
        return structuredClone(report)
      })
      pending = operation.catch(() => {})
      return operation
    },
  }
}
