import { getPalette } from '../../themes/src/index'
import type { ColorMode, Preferences } from '../../themes/src/index'
import type { RenderDiagram, RenderResult } from '../../renderer/src/contract'
import { openViewer } from './viewer'
import { defaultCodeFontFamily } from '../../renderer/src/fonts'
import { createSelectionSurface } from './selection'
import type { SelectedElement } from './selection'
import type { SourceTarget } from '../../source/src/locate'
import { iconButton, contextMenu } from './controls'
import { copyImage, rasterize } from './image'

export interface DiagramOptions {
  render: RenderDiagram
  preferences: Preferences
  colorMode: ColorMode
  fontFamily?: string
  title: string
  filename: string
  save: (file: Blob, filename: string) => void | Promise<void>
  copyImage?: (image: Blob) => void | Promise<void>
  copyText?: (text: string) => void | Promise<void>
  revealSource?: (target?: SourceTarget) => void | Promise<void>
  onSelectionChange?: (selection: SelectedElement[]) => void
}

export function mountDiagram(container: HTMLElement, source: string, options: DiagramOptions) {
  const document = container.ownerDocument
  const figure = document.createElement('figure')
  figure.className = 'flair-diagram'
  figure.tabIndex = 0
  figure.setAttribute('aria-label', options.title)
  const canvas = document.createElement('div')
  canvas.className = 'flair-diagram-canvas'
  const diagram = document.createElement('div')
  diagram.className = 'flair-inline-surface'
  canvas.append(diagram)
  const toolbar = document.createElement('div')
  toolbar.className = 'flair-diagram-tools'
  const expand = iconButton(document, 'expand', 'Expand diagram', showViewer)
  const copy = iconButton(document, 'copy', 'Copy image', () => { void run(async () => {
    if (result) await copyImage(document, result, options.copyImage)
    copy.dataset.copied = 'true'
    setTimeout(() => { delete copy.dataset.copied }, 1500)
  }) })
  expand.disabled = copy.disabled = true
  toolbar.append(expand, copy)
  const count = document.createElement('output')
  count.className = 'flair-sr-only'
  count.setAttribute('aria-label', 'Selected element count')
  const status = document.createElement('div')
  status.className = 'flair-status flair-sr-only'
  status.setAttribute('role', 'status')
  const surface = createSelectionSurface(diagram, selected => {
    count.value = `${selected.length} selected`
    figure.dataset.selectedCount = String(selected.length)
    options.onSelectionChange?.(selected)
  })
  figure.append(canvas, toolbar, count, status)
  container.append(figure)

  let preferences = options.preferences
  let hostMode = options.colorMode
  let hostFont = options.fontFamily
  let cache = ''
  let result: RenderResult | undefined
  let revision = 0
  let rendering: AbortController | undefined
  let viewer: ReturnType<typeof openViewer> | undefined
  let disposed = false
  const removeMenu = contextMenu(figure, () => [
    { label: 'Copy image', run: () => copy.click(), disabled: !result || figure.hasAttribute('aria-busy') },
    { label: 'Copy selected text', run: () => { void run(copySelection) }, disabled: !surface.selected.length },
    { label: 'Save image…', run: () => { void run(async () => { if (result) await options.save(await rasterize(document, result), options.filename.replace(/\.svg$/, '.png')) }) }, disabled: !result || figure.hasAttribute('aria-busy') },
    { label: 'Export SVG…', run: () => { void run(async () => { if (result) await options.save(new Blob([result.svg], { type: 'image/svg+xml' }), options.filename) }) }, disabled: !result || figure.hasAttribute('aria-busy') },
    ...(options.revealSource ? [{ label: 'Show source', run: () => { void run(() => options.revealSource?.(surface.selected.length === 1 ? surface.selected[0].source : undefined)) } }] : []),
  ])

  async function run(action: () => void | Promise<void>) {
    try { await action(); status.textContent = 'Done.'; status.className = 'flair-status flair-sr-only' }
    catch (error) { status.className = 'flair-status'; status.textContent = String(error instanceof Error ? error.message : error) }
  }
  async function copySelection() {
    const text = surface.selected.map(element => element.label).join('\n')
    if (!text) return
    if (options.copyText) await options.copyText(text)
    else await document.defaultView?.navigator.clipboard.writeText(text)
  }
  async function refresh() {
    const theme = preferences.theme
    const mode = preferences.followHost ? hostMode : 'light'
    const fontFamily = hostFont || defaultCodeFontFamily
    toolbar.hidden = !preferences.hoverToolbar
    const nextCache = `${theme}:${mode}:${fontFamily}`
    if (cache === nextCache) return
    cache = nextCache
    const current = ++revision
    rendering?.abort()
    rendering = new AbortController()
    const palette = getPalette(theme, mode)
    for (const [name, value] of Object.entries({ paper: palette.background, text: palette.text, border: palette.border, 'selection-color': palette.accent })) figure.style.setProperty('--flair-' + name, value)
    figure.style.colorScheme = mode
    figure.dataset.theme = theme
    figure.dataset.mode = mode
    figure.setAttribute('aria-busy', 'true')
    expand.disabled = copy.disabled = true
    status.className = 'flair-status flair-sr-only'
    status.replaceChildren()
    try {
      const next = await options.render({ source, theme, colorMode: mode, fontFamily }, rendering.signal)
      if (revision !== current) return
      diagram.style.width = `${next.width}px`
      diagram.style.aspectRatio = `${next.width} / ${next.height}`
      surface.update(next.svg, options.title)
      viewer?.update(next)
      result = next
      expand.disabled = copy.disabled = false
    } catch (error) {
      if (revision !== current) return
      cache = ''
      status.className = 'flair-status flair-error'
      status.textContent = 'This diagram could not be rendered.'
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = 'Details'
      const message = document.createElement('pre')
      message.textContent = String(error instanceof Error ? error.message : error).slice(0, 1600)
      details.append(summary, message)
      status.append(details)
    } finally { if (revision === current) figure.removeAttribute('aria-busy') }
  }
  function showViewer() {
    if (!result || viewer) return
    viewer = openViewer(figure, result, options, keys => {
      viewer = undefined
      if (!disposed) surface.setSelection(keys)
    }, surface.selected.map(element => element.key))
  }
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape' && surface.selected.length) { event.preventDefault(); event.stopPropagation(); surface.clear() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      if (surface.selected.length) void run(copySelection)
      else copy.click()
    }
  })
  figure.addEventListener('keydown', event => {
    if (event.target !== figure) return
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showViewer() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copy.click() }
  })
  void refresh()
  return {
    update(nextPreferences: Preferences, nextMode: ColorMode, nextFont?: string) {
      if (disposed) return
      preferences = nextPreferences; hostMode = nextMode; hostFont = nextFont
      void refresh()
    },
    dispose() { if (disposed) return; disposed = true; revision++; rendering?.abort(); removeMenu(); viewer?.close(); figure.remove() },
  }
}

export function downloadFile(document: Document, file: Blob, filename: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
