import yaml from 'js-yaml'

export const dimensions = [
  { id: 'clarity', name: '指令清晰度', shortName: '清晰度', weight: 20, description: '任务目标、触发场景与输出约定是否清楚。' },
  { id: 'execution', name: '执行完备度', shortName: '执行力', weight: 20, description: '步骤、输入、验证与失败处理是否形成闭环。' },
  { id: 'safety', name: '安全边界', shortName: '安全性', weight: 20, description: '是否明确权限、数据保护和高风险操作边界。' },
  { id: 'efficiency', name: '上下文效率', shortName: '高效性', weight: 15, description: '主文件是否精简、有层次，避免重复与大段堆积。' },
  { id: 'portability', name: '可迁移性', shortName: '可迁移', weight: 15, description: '环境、依赖和文件引用是否便于跨项目使用。' },
  { id: 'maintenance', name: '维护规范', shortName: '可维护', weight: 10, description: '元数据、结构、版本与维护信息是否完整。' },
]

export function evaluateSkill(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('请提供 Skill 的内容。')
  if (input.length > 200000) throw new Error('内容超过 200,000 字符，请精简主文件后重试。')
  const content = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = content.split('\n')
  const warnings = []
  let metadata = {}
  let yamlValid = false
  const frontmatter = content.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  if (frontmatter) {
    try {
      const parsed = yaml.load(frontmatter[1], { schema: yaml.JSON_SCHEMA })
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed
        yamlValid = true
      } else warnings.push('YAML 元数据需要使用键值映射。')
    } catch { warnings.push('YAML 元数据解析失败，请检查缩进、引号和括号。') }
  } else warnings.push('缺少开头的 YAML frontmatter，建议补充 name 与 description。')
  const rawName = typeof metadata.name === 'string' ? metadata.name.trim() : ''
  const description = typeof metadata.description === 'string' ? metadata.description.trim() : ''
  const heading = lines.find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim()
  const name = rawName || heading || 'untitled-skill'
  const body = frontmatter ? content.slice(frontmatter[0].length) : content
  const bodyLines = body.split('\n')
  const headings = bodyLines.filter(line => /^#{1,6}\s/.test(line))
  const nonEmptyLines = bodyLines.map(line => line.trim()).filter(Boolean)
  const repeated = nonEmptyLines.length ? 1 - new Set(nonEmptyLines).size / nonEmptyLines.length : 0
  const wordCount = (content.match(/[\u3400-\u9fff]/g)?.length || 0) + (content.match(/[a-zA-Z0-9_]+/g)?.length || 0)
  const estimatedTokens = Math.ceil((content.match(/[\u3400-\u9fff]/g)?.length || 0) * 1.5 + content.replace(/[\u3400-\u9fff]/g, '').length / 4)
  const dangerous = /(?:curl|wget)[^\n]*\|\s*(?:bash|sh|zsh)|\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+\/(?:\s|$)|\brm\s+-[a-z]*f[a-z]*r[a-z]*\s+\/(?:\s|$)|(?:Remove-Item)[^\n]*(?:C:|D:|\$HOME)[^\n]*-Recurse/i
  const injection = /ignore (?:all )?(?:previous|system) instructions|忽略(?:所有)?(?:系统|之前|先前)指令|reveal (?:the )?system prompt/i
  const riskyLine = lines.findIndex(line => dangerous.test(line) || injection.test(line))
  if (riskyLine >= 0) warnings.push('检测到高风险命令或指令覆盖文本，安全维度已设上限。请人工检查第 ' + (riskyLine + 1) + ' 行。')
  const match = regex => {
    const index = lines.findIndex(line => regex.test(line))
    return index < 0 ? undefined : { line: index + 1, text: lines[index].trim().slice(0, 180) }
  }
  const rule = (id, label, points, passed, suggestion, evidenceRegex) => ({
    id, label, points, passed: Boolean(passed), suggestion,
    ...(passed && evidenceRegex && match(evidenceRegex) ? { evidence: match(evidenceRegex) } : {}),
  })
  const has = regex => regex.test(content)
  const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawName) && rawName.length <= 64
  const checks = {
    clarity: [
      rule('description', '描述完整', 25, description.length >= 20 && description.length <= 1024, '在 description 中简明描述能力与使用时机，建议 20 至 1024 字符。', /description:/),
      rule('trigger', '触发条件明确', 25, has(/when to use|use (?:this )?when|trigger|适用场景|使用时机|当用户|何时使用/i), '增加适用场景，说明什么请求应触发此 Skill。', /when to use|use (?:this )?when|trigger|适用场景|使用时机|当用户|何时使用/i),
      rule('output', '输出约定清楚', 20, has(/output|deliverable|输出|交付物|产物/i), '写明交付格式、文件名或输出字段。', /output|deliverable|输出|交付物|产物/i),
      rule('example', '提供具体示例', 20, has(/example|示例|样例/i), '补充一组具体输入与预期输出示例。', /example|示例|样例/i),
      rule('organized', '标题层次清晰', 10, headings.length >= 3, '使用至少三个 Markdown 标题组织职责、步骤和边界。', /^#{1,6}\s/),
    ],
    execution: [
      rule('steps', '分步工作流程', 25, (body.match(/^\s*\d+[.)、]\s*\S/gm)?.length || 0) >= 3, '提供至少三个按顺序执行的具体步骤。', /^\s*\d+[.)、]\s*\S/),
      rule('inputs', '声明输入要求', 20, has(/input|prerequisite|输入|前置条件|前提条件/i), '定义所需输入、必填字段与缺失信息的处理。', /input|prerequisite|输入|前置条件|前提条件/i),
      rule('validation', '结果可验证', 20, has(/verif|validat|test|checklist|验收|验证|测试|检查清单/i), '增加验收检查，说明如何验证输出正确。', /verif|validat|test|checklist|验收|验证|测试|检查清单/i),
      rule('failures', '覆盖失败处理', 20, has(/error handling|failure|fallback|retry|timeout|异常处理|失败|回退|重试|超时/i), '说明失败、空输入、超时和回退策略。', /error handling|failure|fallback|retry|timeout|异常处理|失败|回退|重试|超时/i),
      rule('actionable', '含操作或格式示范', 15, /\x60{3}[a-z]*\n[\s\S]+?\x60{3}|(?:运行|执行|run|execute)\s+\x60[^\x60]+\x60/i.test(body), '加入可执行命令或结构化输出示范。', /\x60{3}|(?:运行|执行|run|execute)\s+\x60/i),
    ],
    safety: [
      rule('scope', '明确操作边界', 20, has(/out of scope|read.only|边界|只读|禁止|不允许|never/i), '注明允许操作的范围与禁止行为。', /out of scope|read.only|边界|只读|禁止|不允许|never/i),
      rule('approval', '高风险操作确认', 25, has(/confirmation|approval|permission|确认|授权|批准/i), '删除、覆盖、发布或外部发送前明确要求用户确认。', /confirmation|approval|permission|确认|授权|批准/i),
      rule('privacy', '保护敏感数据', 25, has(/credential|secret|privacy|sensitive|密钥|凭证|隐私|敏感|脱敏/i), '声明密钥、凭证和敏感内容的保护要求。', /credential|secret|privacy|sensitive|密钥|凭证|隐私|敏感|脱敏/i),
      rule('untrusted', '处理不可信输入', 15, has(/untrusted|prompt injection|不可信|注入|外部内容.*数据/i), '说明外部文档与工具返回内容作为数据处理。', /untrusted|prompt injection|不可信|注入|外部内容.*数据/i),
      rule('destructive', '高风险文本检查通过', 15, riskyLine < 0, '移除或明确隔离高风险命令与覆盖系统指令的文本。'),
    ],
    efficiency: [
      rule('size', '主文件体量适中', 30, bodyLines.length <= 500 && estimatedTokens <= 5000, '将主文件压缩至 500 行和约 5000 tokens 内，细节移到 references/。'),
      rule('substance', '具备有效内容', 20, body.trim().length >= 350, '补齐目标、操作步骤和输出要求，避免只留下概要。'),
      rule('repetition', '低重复度', 20, repeated < 0.15, '合并反复出现的相同指令与文本。'),
      rule('paragraphs', '段落易于检索', 15, bodyLines.every(line => line.length <= 600), '拆分超过 600 字符的长段落。'),
      rule('progressive', '按需加载参考资料', 15, has(/references\/|按需|on.demand|progressive disclosure/i), '将扩展资料拆到 references/，说明何时按需读取。', /references\/|按需|on.demand|progressive disclosure/i),
    ],
    portability: [
      rule('environment', '说明运行环境', 25, Boolean(metadata.compatibility) || has(/environment|requirements|运行环境|环境要求|依赖要求/i), '通过 compatibility 或环境要求声明运行条件。', /compatibility:|environment|requirements|运行环境|环境要求|依赖要求/i),
      rule('no-absolute-path', '避免硬编码机器路径', 25, !/(?:[A-Za-z]:\\(?:Users|work|projects)|\/Users\/[^/\s]+|\/home\/[^/\s]+)/i.test(content), '用相对路径或环境变量替换个人机器的绝对路径。'),
      rule('dependencies', '依赖与工具可识别', 20, has(/dependenc|依赖|npm |pip |uv |内置|无需安装/i), '列出依赖、安装方式或声明仅使用内置能力。', /dependenc|依赖|npm |pip |uv |内置|无需安装/i),
      rule('paths', '文件路径可迁移', 15, has(/relative|相对路径|\.\/|references\/|scripts\//i), '以 Skill 根目录为基准描述相对路径。', /relative|相对路径|\.\/|references\/|scripts\//i),
      rule('platform', '说明平台兼容性', 15, has(/Windows|macOS|Linux|跨平台|platform.independent|不依赖.*平台/i), '注明支持的平台或平台差异的处理方式。', /Windows|macOS|Linux|跨平台|platform.independent|不依赖.*平台/i),
    ],
    maintenance: [
      rule('yaml', 'YAML 元数据合法', 25, yamlValid, '使用开头的 --- 包裹合法 YAML 键值映射。', /^---/),
      rule('valid-name', '名称符合规范', 25, validName, 'name 使用不超过 64 字符的小写字母、数字和单连字符。', /^name:/),
      rule('version', '提供版本信息', 20, Boolean(metadata.metadata?.version || metadata.version) || has(/changelog|版本记录|变更记录/i), '在 metadata.version 中提供版本，或记录变更历史。', /version:|changelog|版本记录|变更记录/i),
      rule('owner', '维护者可追溯', 15, Boolean(metadata.metadata?.author || metadata.author), '在 metadata.author 中注明维护者。', /author:/),
      rule('license', '声明许可证', 15, typeof metadata.license === 'string' && metadata.license.trim().length > 0, '通过 license 声明使用许可。', /license:/),
    ],
  }
  const results = dimensions.map(dimension => {
    let score = checks[dimension.id].reduce((sum, check) => sum + (check.passed ? check.points : 0), 0)
    if (dimension.id === 'safety' && riskyLine >= 0) score = Math.min(score, 35)
    return { ...dimension, score, checks: checks[dimension.id] }
  })
  const score = Math.round(results.reduce((sum, d) => sum + d.score * d.weight / 100, 0) * 10) / 10
  const references = [...content.matchAll(/(?:references|scripts|assets)\/[a-zA-Z0-9_./-]+/g)].map(m => m[0])
  if (references.length) warnings.push('主文件引用了 ' + new Set(references).size + ' 个配套路径。本次仅分析主文件，引用文件的存在性与内容需要单独验证。')
  return { name, description: description || '该 Skill 暂未提供 description。', score, grade: score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D', dimensions: results, warnings, estimatedTokens, lineCount: lines.length, wordCount, ruleVersion: '1.0.0', author: String(metadata.metadata?.author || metadata.author || '本地提交'), suggestions: results.flatMap(d => d.checks.filter(c => !c.passed).map(c => ({ dimension: d.name, text: c.suggestion, impact: Math.round(c.points * d.weight / 100 * 10) / 10 }))).sort((a, b) => b.impact - a.impact) }
}
