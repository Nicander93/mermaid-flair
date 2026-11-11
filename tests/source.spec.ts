import { expect, test } from '@playwright/test'
import { locateDiagramSource, parseSourceTarget } from '../packages/source/src/locate'

const source = 'flowchart LR\n  %% A[Comment]\n  A[Draft] --> B{Review}\n  B -->|Yes| C[Publish]\n'
const document = '# Diagram\n\n```mermaid\n' + source + '```\n'

test('locates node declarations and labeled connections in the current Markdown', () => {
  expect(locateDiagramSource(document, source, 3, { identifier: 'B', text: 'Review' }))
    .toEqual({ line: 5, matchedElement: true })
  expect(locateDiagramSource(document, source, 3, { text: 'Yes' }))
    .toEqual({ line: 6, matchedElement: true })
  expect(locateDiagramSource(document, source, 3, { identifier: 'A' }))
    .toEqual({ line: 5, matchedElement: true })
  expect(locateDiagramSource('New paragraph\n' + document, source, 3, { identifier: 'B' })?.line).toBe(6)
})

test('locates participants and distinguishes sequence messages by their endpoints', () => {
  const source = 'sequenceDiagram\n  participant U as User\n  participant S as Server\n  U->>S: Sign in\n  S-->>U: Sign in\n'
  const document = '```mermaid\r\n' + source.replace(/\n/g, '\r\n') + '```'
  expect(locateDiagramSource(document, source, 1, { identifier: 'S' })?.line).toBe(3)
  expect(locateDiagramSource(document, source, 1, { text: 'Sign in', from: 'U', to: 'S' })?.line).toBe(4)
})

test('falls back to the diagram for ambiguous elements and refuses stale or duplicate blocks', () => {
  expect(locateDiagramSource(document, source, 3, { text: 'Not available' }))
    .toEqual({ line: 3, matchedElement: false })
  expect(locateDiagramSource(document.replace('Draft', 'Changed'), source, 3)).toBeUndefined()
  expect(locateDiagramSource(document + document, source, 100)).toBeUndefined()
  expect(locateDiagramSource(document + document, source, 3, { identifier: 'C' })?.line).toBe(6)
  const repeated = 'flowchart LR\n A[Repeated]\n B[Repeated]\n'
  expect(locateDiagramSource('```mermaid\n' + repeated + '```', repeated, 1, { text: 'Repeated' }))
    .toEqual({ line: 1, matchedElement: false })
})

test('validates source targets received from the webview', () => {
  expect(parseSourceTarget({ identifier: 'A', text: 'Draft' })).toEqual({ identifier: 'A', text: 'Draft' })
  expect(parseSourceTarget({ identifier: 3 })).toBeUndefined()
  expect(parseSourceTarget({ text: 'x'.repeat(4097) })).toBeUndefined()
  expect(parseSourceTarget(null)).toBeUndefined()
})
