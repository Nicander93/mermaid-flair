import type { RenderDiagram, RenderResponse, RenderResult } from './contract'

export function createIsolatedRenderer(document: Document, script: string) {
  const iframe = document.createElement('iframe')
  iframe.className = 'flair-render-frame'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  const nonce = crypto.randomUUID()
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`
  iframe.srcdoc = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><body><script nonce="${nonce}">${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  const channel = new MessageChannel()
  let id = 0
  let closed = false
  const pending = new Map<number, {
    resolve: (value: RenderResult) => void
    reject: (error: Error) => void
    cleanup: () => void
  }>()
  let acceptConnection: () => void
  const ready = new Promise<void>(resolve => { acceptConnection = resolve })
  channel.port1.onmessage = ({ data }: MessageEvent<RenderResponse | 'ready'>) => {
    if (data === 'ready') {
      acceptConnection()
      return
    }
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    request.cleanup()
    if ('result' in data) request.resolve(data.result)
    else request.reject(new Error(data.error))
  }
  iframe.addEventListener('load', () => {
    if (closed) return
    iframe.contentWindow?.postMessage('mermaid-flair:connect', '*', [channel.port2])
  }, { once: true })
  document.body.append(iframe)

  const render: RenderDiagram = (request, signal) => new Promise((resolve, reject) => {
    if (closed) {
      reject(new Error('The Mermaid renderer has closed.'))
      return
    }
    if (signal?.aborted) { reject(signal.reason); return }
    const requestId = ++id
    let sent = false
    function cleanup() {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    function fail(error: Error) {
      if (!pending.delete(requestId)) return
      cleanup()
      // The frame serializes Mermaid calls. Cancel obsolete queued work there,
      // rather than only ignoring its eventual result in the preview.
      if (sent) channel.port1.postMessage({ id: requestId, cancel: true })
      reject(error)
    }
    function abort() { fail(new DOMException('Mermaid rendering was cancelled.', 'AbortError')) }
    const timeout = setTimeout(() => {
      fail(new Error('Mermaid rendering timed out.'))
    }, 20_000)
    pending.set(requestId, { resolve, reject, cleanup })
    signal?.addEventListener('abort', abort, { once: true })
    void ready.then(() => {
      if (pending.has(requestId)) {
        sent = true
        channel.port1.postMessage({ id: requestId, request })
      }
    })
  })

  return {
    render,
    dispose() {
      if (closed) return
      closed = true
      iframe.remove()
      channel.port1.close()
      channel.port2.close()
      for (const request of pending.values()) {
        request.cleanup()
        request.reject(new Error('The Mermaid renderer has closed.'))
      }
      pending.clear()
      acceptConnection()
    },
  }
}
