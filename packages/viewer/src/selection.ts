import type { SourceTarget } from '../../source/src/locate'

export interface SelectedElement {
  key: string
  label: string
  kind: 'node' | 'connection' | 'participant' | 'message' | 'note'
  source?: SourceTarget
}

interface SelectableElement extends SelectedElement {
  graphics: SVGGraphicsElement[]
}

export function createSelectionSurface(host: HTMLElement, onChange: (selection: SelectedElement[]) => void) {
  const document = host.ownerDocument
  const view = document.defaultView ?? window
  const root = host.attachShadow({ mode: 'open' })
  const styles = document.createElement('style')
  styles.textContent = `
    :host { display: block; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    [data-flair-element] { cursor: pointer; }
    [data-flair-element]:focus { outline: none; }
  `
  root.append(styles)
  let svg: SVGSVGElement | undefined
  let elements: SelectableElement[] = []
  const selected = new Set<string>()
  const originals = new Map<SVGElement, string | null>()
  const markers: SVGElement[] = []
  let hovered: string | undefined
  let focused: string | undefined
  let markerSequence = 0

  function paint() {
    for (const [shape, style] of originals) {
      if (style === null) shape.removeAttribute('style')
      else shape.setAttribute('style', style)
      shape.removeAttribute('data-flair-highlight')
    }
    originals.clear()
    for (const marker of markers) marker.remove()
    markers.length = 0
    if (!svg) return
    const color = view.getComputedStyle(host).getPropertyValue('--flair-selection-color').trim() || '#228be6'
    for (const element of elements) {
      const state = selected.has(element.key) ? 'selected' : focused === element.key ? 'focus' : hovered === element.key ? 'hover' : undefined
      if (!state) continue
      for (const graphic of element.graphics) {
        const shapes = graphic.matches('path,line,rect,polygon,polyline,circle,ellipse,text')
          ? [graphic] : [...graphic.querySelectorAll<SVGElement>('path,line,rect,polygon,polyline,circle,ellipse,text')]
        for (const shape of shapes) {
          if (shape.hasAttribute('data-flair-hit-area')) continue
          const style = view.getComputedStyle(shape)
          originals.set(shape, shape.getAttribute('style'))
          shape.setAttribute('data-flair-highlight', state)
          const set = (property: string, value: string) => shape.style.setProperty(property, value, 'important')
          if (shape.localName === 'text') {
            if (element.kind === 'connection' || element.kind === 'message') set('fill', color)
            continue
          }
          if (style.stroke !== 'none' && style.stroke !== 'transparent' && Number.parseFloat(style.strokeWidth) > 0) {
            set('stroke', color)
            set('stroke-width', state === 'selected' ? '3px' : '2px')
            set('vector-effect', 'non-scaling-stroke')
          }
          if (state === 'selected' && ['node', 'participant', 'note'].includes(element.kind) && style.fill !== 'none') {
            set('fill', `color-mix(in srgb, ${style.fill} 86%, ${color})`)
          }
          for (const position of ['marker-start', 'marker-mid', 'marker-end']) {
            const reference = style.getPropertyValue(position)
            const id = /#([^\s)"']+)/.exec(reference)?.[1]
            const marker = id ? svg.querySelector<SVGElement>(`[id="${CSS.escape(id)}"]`) : null
            if (!marker || marker.localName !== 'marker') continue
            const copy = marker.cloneNode(true) as SVGElement
            copy.id = `${svg.id}-flair-marker-${++markerSequence}`
            for (const child of copy.querySelectorAll<SVGElement>('*')) {
              child.removeAttribute('id')
              if (view.getComputedStyle(marker.querySelector(child.localName) ?? marker).fill !== 'none') child.style.setProperty('fill', color, 'important')
              child.style.setProperty('stroke', color, 'important')
            }
            marker.parentNode?.append(copy)
            markers.push(copy)
            set(position, `url(#${copy.id})`)
          }
        }
      }
    }
  }

  function notify() {
    for (const element of elements) {
      const active = selected.has(element.key)
      for (const graphic of element.graphics) graphic.setAttribute('aria-pressed', String(active))
    }
    paint()
    onChange(elements.filter(element => selected.has(element.key)).map(({ key, label, kind, source }) => ({ key, label, kind, source })))
  }

  root.addEventListener('pointermove', event => {
    const target = event.target
    const key = target instanceof view.Element ? target.closest('[data-flair-element]')?.getAttribute('data-flair-element') ?? undefined : undefined
    if (key === hovered) return
    hovered = key
    paint()
  })
  host.addEventListener('pointerleave', () => { hovered = undefined; paint() })
  root.addEventListener('focusin', event => {
    const target = event.target
    focused = target instanceof view.Element ? target.closest('[data-flair-element]')?.getAttribute('data-flair-element') ?? undefined : undefined
    paint()
  })
  root.addEventListener('focusout', () => { focused = undefined; paint() })

  function select(key: string, additive: boolean) {
    if (!additive) selected.clear()
    if (additive && selected.has(key)) selected.delete(key)
    else selected.add(key)
    notify()
  }

  root.addEventListener('click', event => {
    if (!(event instanceof view.MouseEvent)) return
    const target = event.target
    if (!(target instanceof view.Element)) return
    const key = target.closest('[data-flair-element]')?.getAttribute('data-flair-element')
    if (key) select(key, event.ctrlKey || event.metaKey || event.shiftKey)
    else {
      selected.clear()
      notify()
    }
  })
  root.addEventListener('keydown', event => {
    if (!(event instanceof view.KeyboardEvent) || !['Enter', ' '].includes(event.key)) return
    const target = event.target
    if (!(target instanceof view.Element)) return
    const key = target.closest('[data-flair-element]')?.getAttribute('data-flair-element')
    if (!key) return
    event.preventDefault()
    event.stopPropagation()
    select(key, event.ctrlKey || event.metaKey || event.shiftKey)
  })

  return {
    update(markup: string, title: string) {
      const previous = elements.filter(element => selected.has(element.key))
      const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
      const next = document.importNode(parsed, true)
      if (!(next instanceof view.SVGSVGElement)) throw new Error('The diagram is not a valid SVG.')
      svg?.remove()
      originals.clear()
      markers.length = 0
      hovered = focused = undefined
      svg = next
      svg.setAttribute('aria-label', title)
      svg.setAttribute('role', 'group')
      root.append(svg)
      elements = collectElements(svg)
      for (const element of elements) {
        for (const graphic of element.graphics) {
          graphic.setAttribute('data-flair-element', element.key)
          graphic.setAttribute('role', 'button')
          graphic.setAttribute('aria-label', `${element.kind} · ${element.label}`)
          graphic.setAttribute('tabindex', '0')
          addHitArea(graphic)
        }
      }
      selected.clear()
      for (const element of elements) {
        if (previous.some(value => value.key === element.key && value.kind === element.kind && value.label === element.label)) {
          selected.add(element.key)
        }
      }
      notify()
    },
    clear() {
      selected.clear()
      notify()
    },
    setSelection(keys: string[]) {
      selected.clear()
      for (const element of elements) if (keys.includes(element.key)) selected.add(element.key)
      notify()
    },
    get selected() {
      return elements.filter(element => selected.has(element.key))
    },
    get count() { return elements.length },
  }
}

function collectElements(svg: SVGSVGElement): SelectableElement[] {
  const prefix = svg.id + '-flowchart-'
  const nodeId = (graphic: SVGGraphicsElement) => graphic.id.startsWith(prefix)
    ? graphic.id.slice(prefix.length).replace(/-\d+$/, '') : graphic.getAttribute('data-id') ?? undefined
  const nodes = new Map([...svg.querySelectorAll<SVGGraphicsElement>('.node')]
    .map(graphic => [nodeId(graphic), getGraphicText(graphic)]))
  const labels = new Map([...svg.querySelectorAll<SVGGraphicsElement>('.edgeLabel .label[data-id]')]
    .map(label => [label.getAttribute('data-id'), label.closest<SVGGraphicsElement>('.edgeLabel') ?? label]))
  const messages = [...svg.querySelectorAll<SVGGraphicsElement>('.messageText')]
  let messageIndex = 0
  return [...svg.querySelectorAll<SVGGraphicsElement>('.node, .flowchart-link, [data-et="participant"], [data-et="message"], [data-et="note"]')]
    .map((graphic, index) => {
      const graphics = [graphic]
      let kind: SelectedElement['kind'] = 'node'
      if (graphic.matches('.flowchart-link')) {
        kind = 'connection'
        const label = labels.get(graphic.getAttribute('data-id'))
        if (label) graphics.push(label)
      } else if (graphic.dataset.et === 'message') {
        kind = 'message'
        const label = messages[messageIndex++]
        if (label) graphics.push(label)
      } else if (graphic.dataset.et === 'participant') kind = 'participant'
      else if (graphic.dataset.et === 'note') kind = 'note'
      const text = graphics.map(getGraphicText).filter(Boolean).join(' ')
      let from = graphic.getAttribute('data-from') ?? undefined
      let to = graphic.getAttribute('data-to') ?? undefined
      if (kind === 'connection') {
        const edge = graphic.getAttribute('data-id') ?? graphic.id
        const pairs = [...nodes.keys()].flatMap(id => {
          if (!id || !edge.startsWith(`L_${id}_`)) return []
          const end = edge.slice(id.length + 3).replace(/_\d+$/, '')
          return nodes.has(end) ? [{ from: id, to: end }] : []
        })
        if (pairs.length === 1) ({ from, to } = pairs[0])
      }
      const label = text || (from && to ? `${nodes.get(from) || from} → ${nodes.get(to) || to}` : `${kind === 'connection' ? 'Connection' : 'Element'} ${index + 1}`)
      const identifier = kind === 'node' || kind === 'participant' ? nodeId(graphic) : undefined
      const source: SourceTarget = {
        identifier,
        text: text || undefined,
        from,
        to,
      }
      return { key: String(index), kind, label, source, graphics }
    })
}

function getGraphicText(graphic: SVGGraphicsElement) {
  if (graphic.matches('text')) return (graphic.textContent ?? '').replace(/\s+/g, ' ').trim()
  return [...graphic.querySelectorAll('text')].map(text => {
    const lines = [...text.querySelectorAll('.text-outer-tspan')]
    return lines.length ? lines.map(line => line.textContent).join(' ') : text.textContent
  }).join(' ').replace(/\s+/g, ' ').trim()
}

function addHitArea(graphic: SVGGraphicsElement) {
  let path: SVGGraphicsElement | null = graphic
  if (graphic.localName === 'g' && graphic.matches('.flowchart-link, .messageLine0, .messageLine1')) {
    path = graphic.querySelector('path:last-child')
  }
  if (!path?.matches('path, line')) return
  const hit = path.cloneNode(false) as SVGElement
  for (const attribute of ['id', 'class', 'role', 'tabindex', 'aria-label', 'aria-pressed', 'marker-start', 'marker-end']) hit.removeAttribute(attribute)
  hit.setAttribute('style', 'fill: none !important; stroke: transparent !important; stroke-width: 14px !important; stroke-dasharray: none !important; pointer-events: stroke !important;')
  hit.setAttribute('vector-effect', 'non-scaling-stroke')
  hit.setAttribute('data-flair-hit-area', '')
  hit.setAttribute('aria-hidden', 'true')
  if (path === graphic) {
    const key = graphic.getAttribute('data-flair-element')
    if (key) hit.setAttribute('data-flair-element', key)
  }
  path.parentNode?.append(hit)
}
