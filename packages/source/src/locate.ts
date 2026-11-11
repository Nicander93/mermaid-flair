import { getDiagramBlocks } from './markdown'

export interface SourceTarget {
  identifier?: string
  text?: string
  from?: string
  to?: string
}

export function parseSourceTarget(value: unknown): SourceTarget | undefined {
  if (!value || typeof value !== 'object') return
  const target: SourceTarget = {}
  for (const key of ['identifier', 'text', 'from', 'to'] as const) {
    if (key in value) {
      const text = (value as Record<string, unknown>)[key]
      if (typeof text !== 'string' || text.length > 4096) return
      target[key] = text
    }
  }
  return target
}

export function locateDiagramSource(markdown: string, source: string, hint: number | undefined, target?: SourceTarget) {
  const matches = getDiagramBlocks(markdown).filter(block => normalize(block.source) === normalize(source))
  const block = matches.find(block => block.line === hint) ?? (matches.length === 1 ? matches[0] : undefined)
  if (!block) return
  const offset = findElementLine(block.source, target)
  return { line: block.line + (offset ?? 0), matchedElement: offset !== undefined }
}

function normalize(source: string) {
  return source.replace(/\r\n/g, '\n').trim()
}

function findElementLine(source: string, target?: SourceTarget) {
  if (!target) return
  const lines = source.split(/\r?\n/)
  const candidates = lines.map((text, index) => ({ text: text.trim(), index }))
    .filter(line => line.text && !line.text.startsWith('%%'))
  if (target.identifier) {
    const identifier = escapePattern(target.identifier)
    const declaration = new RegExp(`(?:^|[\\s;>])${identifier}\\s*(?:[\\[({]|@\\{)`, 'u')
    const participant = new RegExp(`^(?:participant|actor)\\s+${identifier}(?=\\s|$)`, 'u')
    const declared = candidates.filter(line => declaration.test(line.text) || participant.test(line.text))
    if (declared.length === 1) return declared[0].index
    const token = new RegExp(`(?:^|[\\s;>])${identifier}(?=\\s|[\\[({<]|[-=]{2}|$)`, 'u')
    const referenced = candidates.filter(line => token.test(line.text))
    if (referenced.length === 1) return referenced[0].index
  }
  if (!target.text) return
  const text = target.text.replace(/\s+/g, ' ').trim()
  const labeled = candidates.filter(line => line.text.replace(/\s+/g, ' ').includes(text))
  if (target.from && target.to) {
    const message = new RegExp(`^${escapePattern(target.from)}\\s*[-<].*?${escapePattern(target.to)}\\s*:`, 'u')
    const directed = labeled.filter(line => message.test(line.text))
    if (directed.length === 1) return directed[0].index
  }
  if (labeled.length === 1) return labeled[0].index
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
