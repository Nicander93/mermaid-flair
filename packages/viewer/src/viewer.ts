import type { RenderResult } from '../../renderer/src/contract'
import type { DiagramOptions } from './index'
import { createSelectionSurface } from './selection'
import { iconButton, contextMenu } from './controls'
import { copyImage, rasterize } from './image'

export function openViewer(
  anchor: HTMLElement,
  initialResult: RenderResult,
  options: DiagramOptions,
  onClose: (selectedKeys: string[]) => void,
  selectedKeys: string[] = [],
) {
  const document = anchor.ownerDocument
  const dialog = document.createElement('dialog')
  dialog.className = 'flair-viewer'
  dialog.setAttribute('aria-label', options.title + ' viewer')
  const toolbar = document.createElement('header')
  toolbar.className = 'flair-viewer-tools'
  const indicator = document.createElement('output')
  indicator.className = 'flair-sr-only'
  indicator.setAttribute('aria-label', 'Zoom level')
  const exportStatus = document.createElement('output')
  exportStatus.className = 'flair-viewer-status flair-sr-only'
  exportStatus.setAttribute('aria-live', 'polite')
  const viewport = document.createElement('div')
  viewport.className = 'flair-viewport'
  viewport.tabIndex = 0
  viewport.setAttribute('aria-label', 'Diagram canvas. Use arrow keys to pan and plus or minus to zoom.')
  const diagram = document.createElement('div')
  diagram.className = 'flair-svg-surface'
  viewport.append(diagram)
  const selectionCount = document.createElement('output')
  selectionCount.className = 'flair-sr-only'
  selectionCount.setAttribute('aria-live', 'polite')
  selectionCount.setAttribute('aria-label', 'Selected element count')
  const selectionText = document.createElement('output')
  selectionText.className = 'flair-sr-only'
  selectionText.setAttribute('aria-label', 'Selected element text')
  const surface = createSelectionSurface(diagram, selected => {
    dialog.dataset.selectedCount = String(selected.length)
    options.onSelectionChange?.(selected)
    selectionCount.value = `${selected.length} selected`
    selectionText.value = selected.map(element => element.label).join('\n')
    selectionText.title = selectionText.value
  })

  let result = initialResult
  let scale = 1
  let x = 0
  let y = 0
  let fitted = true
  let drag: { id: number; startX: number; startY: number; x: number; y: number; moved: boolean } | undefined
  let suppressClick = false

  function syncTransform() {
    diagram.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    indicator.value = `${Math.round(scale * 100)}%`
  }

  function center(nextScale: number, fit: boolean) {
    fitted = fit
    scale = nextScale
    x = (viewport.clientWidth - result.width * scale) / 2
    y = (viewport.clientHeight - result.height * scale) / 2
    syncTransform()
  }

  function fit() {
    const width = Math.max(1, viewport.clientWidth - 40)
    const height = Math.max(1, viewport.clientHeight - 40)
    center(Math.min(1, width / result.width, height / result.height), true)
  }

  function zoom(factor: number, pivotX = viewport.clientWidth / 2, pivotY = viewport.clientHeight / 2) {
    fitted = false
    const next = Math.min(12, Math.max(Math.min(0.02, scale), scale * factor))
    x = pivotX - (pivotX - x) * next / scale
    y = pivotY - (pivotY - y) * next / scale
    scale = next
    syncTransform()
  }

  const closeButton = iconButton(document, 'close', 'Close viewer', () => dialog.close())
  toolbar.append(
    iconButton(document, 'plus', 'Zoom in', () => zoom(1.25)),
    iconButton(document, 'minus', 'Zoom out', () => zoom(1 / 1.25)),
    iconButton(document, 'reset', 'Reset view', fit),
    closeButton,
  )
  dialog.append(viewport, toolbar, indicator, selectionCount, selectionText, exportStatus)
  const removeMenu = contextMenu(dialog, () => [
    { label: 'Copy image', run: () => { void copyWholeImage() } },
    { label: 'Copy selected text', run: () => { void copySelection() }, disabled: !surface.selected.length },
    { label: 'Clear selection', run: () => surface.clear(), disabled: !surface.selected.length },
    { label: 'Save image…', run: () => { void savePng() } },
    { label: 'Export SVG…', run: () => { void save(new Blob([result.svg], { type: 'image/svg+xml' }), options.filename) } },
    ...(options.revealSource ? [{ label: 'Show source', run: () => { void showSource() } }] : []),
  ])
  viewport.addEventListener('wheel', event => {
    event.preventDefault()
    const bounds = viewport.getBoundingClientRect()
    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - bounds.left, event.clientY - bounds.top)
  }, { passive: false })
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return
    drag = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX - x, y: event.clientY - y, moved: false,
    }
  })
  viewport.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
      drag.moved = true
      suppressClick = true
      viewport.setPointerCapture(event.pointerId)
      viewport.classList.add('flair-dragging')
    }
    fitted = false
    x = event.clientX - drag.x
    y = event.clientY - drag.y
    syncTransform()
  })
  viewport.addEventListener('lostpointercapture', event => {
    if (drag?.id !== event.pointerId) return
    drag = undefined
    viewport.classList.remove('flair-dragging')
  })
  viewport.addEventListener('pointerup', () => {
    drag = undefined
    viewport.classList.remove('flair-dragging')
    setTimeout(() => { suppressClick = false }, 0)
  })
  viewport.addEventListener('pointercancel', () => {
    drag = undefined
    suppressClick = false
    viewport.classList.remove('flair-dragging')
  })
  viewport.addEventListener('pointerleave', () => {
    if (drag && !drag.moved) drag = undefined
  })
  viewport.addEventListener('click', event => {
    if (suppressClick) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.target === viewport) surface.clear()
  }, { capture: true })
  viewport.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      if (surface.selected.length) void copySelection()
      else void copyWholeImage()
      return
    }
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [32, 0], ArrowRight: [-32, 0], ArrowUp: [0, 32], ArrowDown: [0, -32],
    }
    const offset = offsets[event.key]
    if (offset) {
      fitted = false
      x += offset[0]
      y += offset[1]
      syncTransform()
    } else if (event.key === '+' || event.key === '=') zoom(1.25)
    else if (event.key === '-') zoom(1 / 1.25)
    else return
    event.preventDefault()
  })
  // The host may also bind Escape at the window level.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    dialog.close()
  })
  const resize = new ResizeObserver(() => { if (fitted) fit() })
  dialog.addEventListener('close', () => {
    resize.disconnect()
    removeMenu()
    dialog.remove()
    if (anchor.isConnected) anchor.focus()
    onClose(surface.selected.map(element => element.key))
  }, { once: true })

  function update(nextResult: RenderResult) {
    const dimensionsChanged = nextResult.width !== result.width || nextResult.height !== result.height
    result = nextResult
    diagram.style.width = `${result.width}px`
    diagram.style.height = `${result.height}px`
    dialog.style.setProperty('--flair-selection-color', document.defaultView?.getComputedStyle(anchor).getPropertyValue('--flair-selection-color') || '#228be6')
    surface.update(result.svg, options.title)
    dialog.style.backgroundColor = document.defaultView?.getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') || result.background
    if (dimensionsChanged || fitted) fit()
  }

  async function copyWholeImage() {
    try { await copyImage(document, result, options.copyImage) }
    catch (error) { exportStatus.classList.remove('flair-sr-only'); exportStatus.value = String(error) }
  }

  async function copySelection() {
    const text = surface.selected.map(element => element.label).join('\n')
    if (!text) return
    try {
      if (options.copyText) await options.copyText(text)
      else await document.defaultView?.navigator.clipboard.writeText(text)
      exportStatus.value = 'Selected text copied.'
    } catch (error) {
      exportStatus.classList.remove('flair-sr-only')
      exportStatus.value = 'Could not copy selected text. ' + String(error)
    }
  }

  async function showSource() {
    try {
      await options.revealSource?.(surface.selected[0]?.source)
    } catch (error) {
      exportStatus.value = 'Could not open diagram source. ' + String(error)
    }
  }

  async function save(file: Blob, filename: string) {
    try {
      exportStatus.value = ''
      await options.save(file, filename)
    } catch (error) {
      exportStatus.value = 'Export failed. ' + String(error)
    }
  }

  async function savePng() {
    try {
      const file = await rasterize(document, result)
      if (dialog.open) await save(file, options.filename.replace(/\.svg$/, '.png'))
    } catch (error) {
      exportStatus.value = 'Export failed. ' + String(error)
    }
  }
  document.body.append(dialog)
  dialog.showModal()
  resize.observe(viewport)
  update(initialResult)
  surface.setSelection(selectedKeys)
  closeButton.focus()
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close()
  })

  return { update, close: () => dialog.close() }
}
