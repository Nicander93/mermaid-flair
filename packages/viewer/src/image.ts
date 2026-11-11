import type { RenderResult } from '../../renderer/src/contract'

export async function rasterize(document: Document, result: RenderResult) {
  const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = document.createElement('img')
    image.src = url
    await image.decode()
    const ratio = Math.min(2, 4096 / Math.max(result.width, result.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(result.width * ratio))
    canvas.height = Math.max(1, Math.round(result.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'))
  } finally { URL.revokeObjectURL(url) }
}

export function copyImage(document: Document, result: RenderResult, copy?: (image: Blob) => void | Promise<void>) {
  const image = rasterize(document, result)
  if (copy) return image.then(copy)
  const view = document.defaultView
  if (!view?.ClipboardItem || !view.navigator.clipboard?.write) throw new Error('Image copying is unavailable. Use Save image from the diagram menu.')
  // Start the clipboard operation inside the user gesture. Chromium can await
  // the PNG promise without losing the transient activation while it renders.
  return view.navigator.clipboard.write([new view.ClipboardItem({ 'image/png': image })])
}
