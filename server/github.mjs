
export function parseGitHubSource(input) {
  let url
  try { url = new URL(input) } catch { throw new Error('请输入有效的 GitHub HTTPS 链接。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname)) throw new Error('仅支持 github.com 与 raw.githubusercontent.com 的 HTTPS 链接。')
  let parts
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent) } catch { throw new Error('链接包含无效编码。') }
  if (parts.length < 2 || !parts.slice(0, 2).every(p => /^[a-zA-Z0-9_.-]+$/.test(p)) || parts.some(p => p === '..' || p === '.')) throw new Error('请提供有效的仓库或 SKILL.md 文件地址。')
  const [owner, rawRepo] = parts
  const repo = rawRepo.replace(/\.git$/, '')
  if (url.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 4) throw new Error('Raw 链接需要包含分支和文件路径。')
    return { owner, repo, ref: parts[2], path: parts.slice(3).join('/'), type: 'file' }
  }
  if (parts.length === 2) return { owner, repo, ref: null, path: 'SKILL.md', type: 'repository' }
  if (!['blob', 'tree'].includes(parts[2]) || parts.length < 4) throw new Error('请使用 GitHub 文件、目录或仓库地址。')
  let filePath = parts.slice(4).join('/')
  if (parts[2] === 'tree') filePath = filePath ? filePath + '/SKILL.md' : 'SKILL.md'
  if (!/\.md$/i.test(filePath)) throw new Error('请选择 Markdown 文件，或包含 SKILL.md 的目录。')
  return { owner, repo, ref: parts[3], path: filePath, type: 'file' }
}

async function limitedFetch(url, json = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'User-Agent': 'SkillScope/1.0', Accept: json ? 'application/vnd.github+json' : 'text/plain' } })
  if (!response.ok) {
    if (response.status === 404) throw new Error('未找到文件，请确认仓库公开、分支和路径正确。')
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求频率已达上限，请稍后重试或粘贴文件内容。')
    throw new Error('GitHub 暂时无法响应，请稍后重试。')
  }
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 800000) throw new Error('远程文件过大，请提供精简后的 SKILL.md。')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return json ? JSON.parse(text) : text
}

export async function importGitHub(input) {
  const source = parseGitHubSource(input)
  if (!source.ref) {
    const repository = await limitedFetch('https://api.github.com/repos/' + source.owner + '/' + source.repo, true)
    source.ref = repository.default_branch
  }
  const encodePath = value => value.split('/').map(encodeURIComponent).join('/')
  const rawUrl = 'https://raw.githubusercontent.com/' + source.owner + '/' + source.repo + '/' + encodePath(source.ref) + '/' + encodePath(source.path)
  try {
    const content = await limitedFetch(rawUrl)
    if (/^\s*<!doctype|^\s*<html/i.test(content)) throw new Error('远程地址返回了网页，请选择原始 Markdown 文件。')
    return { content, sourceUrl: input, author: source.owner }
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('GitHub 连接超时，可以下载文件后上传或粘贴内容。')
    throw error
  }
}
