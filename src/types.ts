export interface Evidence { line: number; text: string }
export interface Check { id: string; label: string; points: number; passed: boolean; suggestion: string; evidence?: Evidence }
export interface Dimension { id: string; name: string; shortName: string; weight: number; description: string; score: number; checks: Check[] }
export interface Skill { id: string; name: string; title: string; description: string; score: number; grade: string; dimensions: Dimension[]; warnings: string[]; estimatedTokens: number; lineCount: number; wordCount: number; ruleVersion: string; author: string; suggestions: { dimension: string; text: string; impact: number }[]; category: string; icon: string; color: string; isDemo: boolean; createdAt: string; content?: string; sourceUrl?: string; semantic?: SemanticResult }

export interface SemanticDimension { id: string; name: string; score: number; reason: string; suggestion: string; evidence: Evidence[] }
export interface SemanticResult { model: string; createdAt: string; note: string; dimensions: SemanticDimension[] }
