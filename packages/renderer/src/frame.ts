import { renderDiagram } from './render'
import type { RenderRequest, RenderResponse } from './contract'

window.addEventListener('message', function connect(event) {
  const port = event.ports[0]
  if (event.source !== window.parent || event.data !== 'mermaid-flair:connect' || !port) return
  window.removeEventListener('message', connect)
  const jobs = new Map<number, AbortController>()
  port.onmessage = async ({ data }: MessageEvent<{ id: number; request: RenderRequest } | { id: number; cancel: true }>) => {
    if ('cancel' in data) { jobs.get(data.id)?.abort(); return }
    const controller = new AbortController()
    jobs.set(data.id, controller)
    let response: RenderResponse
    try {
      response = { id: data.id, result: await renderDiagram(data.request, controller.signal) }
    } catch (error) {
      response = { id: data.id, error: String(error instanceof Error ? error.message : error) }
    }
    jobs.delete(data.id)
    port.postMessage(response)
  }
  port.postMessage('ready')
})
