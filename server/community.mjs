const SOURCE = 'https://www.skills.sh/'

export function parseLeaderboard(html) {
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)) {
    let payload
    try { payload = JSON.parse(match[1]) } catch { continue }
    const data = payload.match(/"initialSkills":(\[[\s\S]*?\]),"totalSkills":(\d+)/)
    if (!data || !payload.includes('"view":"all-time"')) continue
    const skills = JSON.parse(data[1]).filter(item => /^[\w.-]+\/[\w.-]+$/.test(item.source) && /^[\w.-]+$/.test(item.skillId) && Number.isFinite(item.installs) && item.installs >= 0).map(item => ({
      source: item.source, name: String(item.name || item.skillId), skillId: item.skillId,
      installs: item.installs, url: SOURCE + item.source + '/' + item.skillId,
    }))
    if (skills.length) return { skills, totalSkills: Number(data[2]) }
  }
  throw new Error('社区榜单格式发生变化，暂时无法读取。')
}

export function createLeaderboardReader({ fetcher = fetch, now = Date.now } = {}) {
  const ttl = 60 * 60 * 1000
  let cache
  let pending
  async function refresh() {
    if (pending) return pending
    pending = (async () => {
    try {
      const response = await fetcher(SOURCE, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'User-Agent': 'SkillScope/1.0' } })
      if (!response.ok) throw new Error('上游服务返回 ' + response.status)
      const html = await response.text()
      if (html.length > 4_000_000) throw new Error('上游响应超出限制。')
      const timestamp = now()
      const data = { ...parseLeaderboard(html), fetchedAt: new Date(timestamp).toISOString(), source: SOURCE, metric: '累计安装量', stale: false }
      cache = { timestamp, data }
      return data
    } catch {
      if (cache) return { ...cache.data, stale: true }
      throw new Error('暂时无法读取 skills.sh 社区榜单，请稍后重试。')
    }
    })()
    try { return await pending } finally { pending = undefined }
  }
  async function getLeaderboard() {
    if (cache && now() - cache.timestamp < ttl) return cache.data
    return refresh()
  }
  getLeaderboard.refresh = refresh
  getLeaderboard.cached = async () => {
    if (!cache && pending) return pending
    if (!cache) throw new Error('社区榜单正在首次更新，请稍后重试。')
    return { ...cache.data, stale: cache.data.stale || now() - cache.timestamp >= ttl }
  }
  return getLeaderboard
}

export const getLeaderboard = createLeaderboardReader()
