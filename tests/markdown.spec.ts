import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { getDiagramBlocks } from '../packages/source/src/markdown'

test('extracts Mermaid fences from the regression document', () => {
  const markdown = readFileSync('fixtures/mermaid/multi-diagram.md', 'utf8')
  const diagrams = getDiagramBlocks(markdown)
  expect(diagrams).toHaveLength(10)
  expect(diagrams[0].line).toBe(5)
  expect(diagrams[0].source).toContain('入口 / API gateway')
  expect(diagrams[1].source).toContain('Authorization Server')
})

test('handles nested and tilde fences and ignores literal and non-Mermaid fences', () => {
  const markdown = [
    '~~~~markdown', '```mermaid', 'graph TD', '```', '~~~~', '',
    '> ~~~Mermaid title', '> flowchart LR', '>   A --> B', '> ~~~', '',
    '```mermaidx', 'ignore', '```', '',
    '```mermaid', 'sequenceDiagram', '  A->>B: nested token',
  ].join('\r\n')
  expect(getDiagramBlocks(markdown)).toEqual([
    { line: 7, source: 'flowchart LR\n  A --> B\n' },
    { line: 16, source: 'sequenceDiagram\n  A->>B: nested token' },
  ])
})
