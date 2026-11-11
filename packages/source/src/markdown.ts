import MarkdownIt from 'markdown-it'

export interface DiagramBlock {
  line: number
  source: string
}

const markdown = new MarkdownIt()

export function getDiagramBlocks(source: string): DiagramBlock[] {
  return markdown.parse(source, {})
    .filter(token => token.type === 'fence' && /^mermaid(?:\s|$)/i.test(token.info.trim()))
    .map(token => ({ line: (token.map?.[0] ?? 0) + 1, source: token.content }))
}
