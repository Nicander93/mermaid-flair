import { renderDiagram } from '../../../packages/renderer/src/render'
import { downloadFile, mountDiagram } from '../../../packages/viewer/src/index'
import { defaults, normalizeTheme } from '../../../packages/themes/src/index'
import type { Preferences } from '../../../packages/themes/src/index'
import type { SourceTarget } from '../../../packages/source/src/locate'

interface NativeOptions {
  source?: string
  line: number
  token?: string
  sourceLink?: string
  preferences: Preferences
  fontFamily?: string
}

function sourceLink(value: unknown, token: string | undefined) {
  if (typeof value !== 'string' || !token || !/^[a-f0-9]{36}$/.test(token)) return
  try {
    const uri = new URL(value)
    if (!/^(?:vscode(?:-insiders)?|cursor(?:-insiders)?|vscodium|code-oss):$/.test(uri.protocol)
      || uri.hostname !== 'mermaid-flair.mermaid-flair' || uri.pathname !== '/source'
      || uri.username || uri.password || uri.searchParams.get('token') !== token) return
    return uri
  } catch { return }
}

function start() {
  const mounted = new Map<HTMLElement, { diagram: ReturnType<typeof mountDiagram>; options: NativeOptions }>()
  const mode = () => document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast') ? 'dark' : 'light'
  const font = (options: NativeOptions) => getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || options.fontFamily

  function sync() {
    for (const [element, entry] of mounted) {
      if (element.isConnected) continue
      entry.diagram.dispose()
      mounted.delete(element)
    }
    for (const element of document.querySelectorAll<HTMLElement>('.flair-native-diagram[data-flair-options]')) {
      if (mounted.has(element)) continue
      const code = element.querySelector('pre > code')
      if (!code) continue
      let options: NativeOptions
      try { options = JSON.parse(element.dataset.flairOptions ?? '') } catch { continue }
      if (!options || !Number.isSafeInteger(options.line) || options.line < 1) continue
      options.preferences = {
        theme: normalizeTheme(options.preferences?.theme) ?? defaults.theme,
        followHost: typeof options.preferences?.followHost === 'boolean' ? options.preferences.followHost : defaults.followHost,
        hoverToolbar: typeof options.preferences?.hoverToolbar === 'boolean' ? options.preferences.hoverToolbar : defaults.hoverToolbar,
      }
      if (typeof options.fontFamily !== 'string') options.fontFamily = undefined
      const sourceUri = sourceLink(options.sourceLink, options.token)
      const source = typeof options.source === 'string' ? options.source : code.textContent ?? ''
      code.parentElement?.remove()
      let target: SourceTarget | undefined
      const updateContext = () => {
        element.dataset.vscodeContext = JSON.stringify({ webviewSection: 'mermaid-flair', flairToken: options.token, flairTarget: target })
      }
      updateContext()
      const diagram = mountDiagram(element, source, {
        render: renderDiagram,
        preferences: options.preferences,
        colorMode: mode(),
        fontFamily: font(options),
        title: `Mermaid diagram · line ${options.line}`,
        filename: `mermaid-line-${options.line}.svg`,
        save: (file, filename) => downloadFile(document, file, filename),
        copyText: text => navigator.clipboard.writeText(text),
        revealSource: sourceUri ? value => {
          const link = document.createElement('a')
          sourceUri.searchParams.set('target', JSON.stringify(value ?? null))
          link.href = sourceUri.toString()
          document.body.append(link)
          link.click()
          link.remove()
        } : undefined,
        onSelectionChange: selected => { target = selected.length === 1 ? selected[0].source : undefined; updateContext() },
      })
      mounted.set(element, { diagram, options })
    }
  }

  let scheduled = false
  const changes = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => { scheduled = false; sync() })
  })
  changes.observe(document.body, { childList: true, subtree: true })
  const appearance = new MutationObserver(() => {
    for (const { diagram, options } of mounted.values()) diagram.update(options.preferences, mode(), font(options))
  })
  appearance.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  window.addEventListener('pagehide', () => {
    changes.disconnect()
    appearance.disconnect()
    for (const { diagram } of mounted.values()) diagram.dispose()
    mounted.clear()
  }, { once: true })
  sync()
}

const key = Symbol.for('mermaid-flair.native-preview')
const runtime = window as unknown as Record<symbol, boolean>
if (!runtime[key]) {
  runtime[key] = true
  start()
}
