import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExportOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons'
import type { Skill } from './types'

interface CommunityItem { source: string; name: string; skillId: string; installs: number; url: string }
interface CommunityData { skills: CommunityItem[]; totalSkills: number; fetchedAt: string; source: string; stale: boolean }

export function CommunityRanking() {
  const [data, setData] = useState<CommunityData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true); setError('')
    fetch('/api/community').then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setData(body)
    }).catch(reason => setError(reason.message || '社区数据暂不可用。')).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const filtered = data?.skills.filter(item => (item.name + ' ' + item.source).toLowerCase().includes(query.toLowerCase().trim())) || []
  return <div className="page secondary-page community-page">
    <div className="community-head"><div><h1>社区热门 Skills</h1><p>按 skills.sh 累计安装量排序 · 热度不代表质量或安全性</p></div></div>
    <div className="community-tools"><div><strong>累计安装量</strong><span>{data ? `公开榜单 ${data.skills.length} 条 · 上游技能总量 ${data.totalSkills.toLocaleString()} 条` : '正在连接数据源'}</span></div><label><SearchOutlined/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索榜单" aria-label="搜索社区榜单"/></label></div>
    {data && <p className="community-updated">{data.stale ? '上游暂不可用，当前为缓存数据 · ' : ''}更新时间 {new Date(data.fetchedAt).toLocaleString('zh-CN')} · <a href="https://skills.sh/" target="_blank" rel="noreferrer">数据来源 <ExportOutlined/></a></p>}
    {loading && !data ? <div className="loading">正在读取社区数据…</div> : error ? <div className="community-error">{error} 服务端会在下一次每小时更新时重试。</div> : <div className="community-list">
      {filtered.map((item) => <a className="community-row" href={item.url} target="_blank" rel="noreferrer" key={item.source + '/' + item.skillId}><span className="community-rank">{String(data!.skills.indexOf(item) + 1).padStart(2, '0')}</span><span className="community-item-icon"><RobotOutlined/></span><span className="community-name"><strong>{item.name}</strong><small>{item.source}</small></span><span className="community-installs"><strong>{item.installs.toLocaleString()}</strong><small>累计安装</small></span><ExportOutlined className="community-external"/></a>)}
      {!filtered.length && <div className="empty"><h3>没有匹配结果</h3><p>换个关键词搜索当前展示的榜单。</p></div>}
    </div>}
    <div className="community-foot">数据来源 skills.sh · 本站不将社区安装量转换为质量评分</div>
  </div>
}

interface LlmSettingsState { configured: boolean; baseUrl: string; model: string; hasApiKey: boolean }

export function LlmSettings() {
  const [settings, setSettings] = useState<LlmSettingsState>({ configured: false, baseUrl: '', model: '', hasApiKey: false })
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/llm/config').then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSettings(result); setBaseUrl(result.baseUrl); setModel(result.model)
    }).catch(reason => setError(reason.message || '读取配置失败。')).finally(() => setLoaded(true))
  }, [])

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(path, options)
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '请求失败。')
    return result
  }
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await request('/api/llm/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl, model, apiKey }) })
      setSettings(result); setApiKey(''); setMessage('配置已保存在当前服务内存中。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败。') }
    finally { setBusy(false) }
  }
  async function testConnection() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await request('/api/llm/config/test', { method: 'POST' }); setMessage(`连接成功 · ${result.model}`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '连接测试失败。') }
    finally { setBusy(false) }
  }
  async function clear() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await request('/api/llm/config', { method: 'DELETE' }); setSettings(result); setBaseUrl(''); setModel(''); setApiKey(''); setMessage('配置已清除。') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '清除失败。') }
    finally { setBusy(false) }
  }

  return <div className="page secondary-page llm-settings-page">
    <div className="community-head"><div><h1>LLM 服务</h1><p>配置 OpenAI 兼容的 Chat Completions 服务，用于报告语义分析。</p></div></div>
    {!loaded ? <div className="loading">正在读取配置…</div> : <section className="llm-settings">
      <div className="llm-config-status"><span className={settings.configured ? 'status-dot configured' : 'status-dot'}/><strong>{settings.configured ? '已配置' : '未配置'}</strong>{settings.hasApiKey && <span>API 密钥已保存</span>}</div>
      <label>服务地址<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="url"/></label>
      <label>模型名称<input value={model} onChange={event => setModel(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off"/></label>
      <label>API 密钥<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? '已保存；留空则保持不变' : '输入服务密钥'} autoComplete="new-password"/></label>
      <p className="llm-security-note">密钥仅保存在服务进程内存中，不会写入评测数据或回传到页面；服务重启后需重新配置。运行语义分析时，Skill 主文件会发送至该服务。</p>
      {error && <div className="form-error">{error}</div>}{message && <p className="llm-message" role="status">{message}</p>}
      <div className="llm-actions"><button className="primary-button" disabled={busy || !baseUrl.trim() || !model.trim() || (!settings.hasApiKey && !apiKey.trim())} onClick={() => void save()}>保存配置</button><button className="secondary-button" disabled={busy || !settings.configured} onClick={() => void testConnection()}>测试连接</button><button className="text-button" disabled={busy || !settings.configured} onClick={() => void clear()}>清除配置</button></div>
    </section>}
  </div>
}

export function SemanticAnalysis({ skill, onUpdate }: { skill: Skill; onUpdate: (skill: Skill) => void }) {
  const [status, setStatus] = useState<{configured: boolean; model: string} | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { fetch('/api/semantic/status').then(r => r.json()).then(setStatus).catch(() => setStatus({configured:false,model:''})) }, [])
  async function run() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/skills/' + encodeURIComponent(skill.id) + '/semantic', {method:'POST'})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onUpdate(result)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '语义分析失败') }
    finally { setBusy(false) }
  }
  return <section className="semantic-panel report-section"><div className="semantic-top"><div><div className="eyebrow"><span/> SEMANTIC REVIEW</div><h2>LLM 语义分析</h2><p>围绕六个维度解释内容，并引用原文行号。</p></div><button className="primary-button" disabled={!status?.configured || busy} onClick={run}><RobotOutlined/> {busy ? '分析中…' : skill.semantic ? '重新分析' : '开始分析'}</button></div>
    {status?.configured ? <p className="semantic-notice">模型 {status.model} · 点击开始后，主文件内容将发送给配置的模型服务。结果保存在本机。</p> : <p className="semantic-notice">尚未配置模型服务。<Link to="/llm">前往配置</Link></p>}
    {error && <div className="form-error">{error}</div>}
    {skill.semantic && <><p className="semantic-notice">{skill.semantic.note} · {skill.semantic.model} · {new Date(skill.semantic.createdAt).toLocaleString('zh-CN')}</p><div className="semantic-dimensions">{skill.semantic.dimensions.map(d => <article key={d.id}><div><strong>{d.name}</strong><b>{d.score}<small> / 100</small></b></div><p>{d.reason}</p>{d.evidence.length > 0 ? <div className="semantic-evidence">{d.evidence.map(e => <blockquote key={e.line}>第 {e.line} 行 · {e.text}</blockquote>)}</div> : <p className="semantic-evidence">没有可引用的原文行，需进一步核实。</p>}<p><strong>建议</strong> {d.suggestion}</p></article>)}</div></>}
  </section>
}
