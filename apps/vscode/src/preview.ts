import { renderDiagram } from '../../../packages/renderer/src/render'
import { mountDiagram } from '../../../packages/viewer/src/index'
import type { PreviewMessage, PreviewState } from './messages'

declare function acquireVsCodeApi(): { postMessage(message: PreviewMessage): void }

const vscode = acquireVsCodeApi()
const main = document.querySelector<HTMLElement>('#flair-preview')
if (!main) throw new Error('Missing Mermaid Flair preview root.')
const heading = document.createElement('h1')
const header = document.createElement('header')
header.className = 'flair-preview-header'
const defaultTheme = document.createElement('button')
defaultTheme.type = 'button'
defaultTheme.textContent = 'Default theme…'
defaultTheme.addEventListener('click', () => vscode.postMessage({ type: 'chooseTheme' }))
header.append(heading, defaultTheme)
const empty = document.createElement('p')
empty.textContent = 'No Mermaid code blocks in this document.'
const list = document.createElement('div')
main.append(header, empty, list)

interface MountedDiagram {
  element: HTMLElement
  diagram: ReturnType<typeof mountDiagram>
}
let mounted = new Map<string, MountedDiagram>()
window.addEventListener('message', ({ data }: MessageEvent<PreviewState>) => {
  if (!Array.isArray(data?.diagrams)) return
  heading.textContent = data.name
  empty.hidden = data.diagrams.length > 0
  const next = new Map<string, MountedDiagram>()
  let previous: Element | null = null
  for (const block of data.diagrams) {
    const key = `${block.line}:${block.source}`
    let entry = mounted.get(key)
    if (entry) {
      mounted.delete(key)
      entry.diagram.update(data.preferences, data.colorMode, data.fontFamily)
    } else {
      const element = document.createElement('section')
      const diagram = mountDiagram(element, block.source, {
        render: renderDiagram,
        preferences: data.preferences,
        colorMode: data.colorMode,
        fontFamily: data.fontFamily,
        title: `Mermaid diagram · line ${block.line}`,
        filename: `mermaid-line-${block.line}.svg`,
        save: saveDiagram,
        copyText: text => vscode.postMessage({ type: 'copy', text }),
        revealSource: target => vscode.postMessage({ type: 'revealSource', source: block.source, blockLine: block.line, target }),
      })
      entry = { element, diagram }
    }
    if (entry.element !== (previous ? previous.nextElementSibling : list.firstElementChild)) {
      list.insertBefore(entry.element, previous ? previous.nextElementSibling : list.firstElementChild)
    }
    previous = entry.element
    next.set(key, entry)
  }
  for (const entry of mounted.values()) {
    entry.diagram.dispose()
    entry.element.remove()
  }
  mounted = next
})
vscode.postMessage({ type: 'ready' })

async function saveDiagram(file: Blob, filename: string) {
  if (file.type !== 'image/png') {
    vscode.postMessage({ type: 'export', svg: await file.text(), filename })
    return
  }
  const reader = new FileReader()
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const url = reader.result
      if (typeof url === 'string') resolve(url.slice(url.indexOf(',') + 1))
      else reject(new Error('PNG encoding failed.'))
    }
    reader.readAsDataURL(file)
  })
  vscode.postMessage({ type: 'exportPng', base64, filename })
}
