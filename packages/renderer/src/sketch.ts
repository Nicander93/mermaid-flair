import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'

const geometryAttributes = new Set([
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points',
  'x1', 'x2', 'y1', 'y2', 'marker-start', 'marker-mid', 'marker-end',
])

export function applySketch(svg: SVGSVGElement) {
  const renderer = rough.svg(svg)
  const shapes = svg.querySelectorAll<SVGGraphicsElement>([
    '.node .label-container',
    '.node > rect',
    '.node > polygon',
    '.node > circle',
    '.node > ellipse',
    '.cluster > rect',
    'rect.actor',
    'rect.note',
    'path.flowchart-link',
    'line.actor-line',
    'line.messageLine0',
    'line.messageLine1',
    'path.messageLine0',
    'path.messageLine1',
    'line.loopLine',
  ].join(','))
  let index = 0
  for (const shape of shapes) {
    const style = getComputedStyle(shape)
    const line = shape.matches('line, .flowchart-link, .messageLine0, .messageLine1')
    const options: Options = {
      seed: 17 + index++ * 53,
      roughness: line ? 0.25 : 0.6,
      bowing: 0.35,
      maxRandomnessOffset: 1,
      // Keep the original joins and arrow endpoints. Independent random offsets
      // and doubled segments otherwise leave gaps and spikes at rounded corners.
      preserveVertices: true,
      disableMultiStroke: true,
      fillShapeRoughnessGain: 0,
      stroke: style.stroke,
      strokeWidth: shape.style.getPropertyValue('stroke-width')
        ? parseFloat(style.strokeWidth) || 0 : Math.max(1.5, parseFloat(style.strokeWidth) || 0),
      fill: line || style.fill === 'none' ? undefined : style.fill,
      fillStyle: 'solid',
      strokeLineDash: style.strokeDasharray === 'none' ? undefined : style.strokeDasharray.split(/[ ,]+/).map(value => parseFloat(value)),
    }
    const drawing = drawShape(shape, style, options)
    if (!drawing) continue
    for (const { name, value } of [...shape.attributes]) {
      if (!geometryAttributes.has(name)) drawing.setAttribute(name, value)
    }
    drawing.classList.add('flair-sketch-shape')
    drawing.style.opacity = style.opacity
    // Mermaid's shape selectors also match Rough.js paths. Keep each generated
    // fill and outline intact while retaining the author's resolved node colors.
    for (const path of drawing.querySelectorAll('path')) {
      for (const property of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray']) {
        const value = path.getAttribute(property)
        if (value) path.style.setProperty(property, value, 'important')
      }
    }
    // Arrow markers belong on the outline, never on the solid fill path.
    const stroke = drawing.lastElementChild
    stroke?.setAttribute('stroke-linecap', 'round')
    stroke?.setAttribute('stroke-linejoin', 'round')
    for (const marker of ['marker-start', 'marker-mid', 'marker-end']) {
      const value = shape.getAttribute(marker)
      if (value) stroke?.setAttribute(marker, value)
    }
    shape.replaceWith(drawing)
  }
  function drawShape(shape: SVGGraphicsElement, style: CSSStyleDeclaration, options: Options) {
    if (shape instanceof SVGPathElement) return renderer.path(shape.getAttribute('d') ?? '', options)
    if (shape instanceof SVGLineElement) {
      return renderer.line(shape.x1.baseVal.value, shape.y1.baseVal.value, shape.x2.baseVal.value, shape.y2.baseVal.value, options)
    }
    if (shape instanceof SVGPolygonElement) {
      return renderer.polygon([...shape.points].map(point => [point.x, point.y]), options)
    }
    if (shape instanceof SVGCircleElement) {
      return renderer.circle(shape.cx.baseVal.value, shape.cy.baseVal.value, shape.r.baseVal.value * 2, options)
    }
    if (shape instanceof SVGEllipseElement) {
      return renderer.ellipse(shape.cx.baseVal.value, shape.cy.baseVal.value, shape.rx.baseVal.value * 2, shape.ry.baseVal.value * 2, options)
    }
    if (!(shape instanceof SVGRectElement)) return
    const x = shape.x.baseVal.value
    const y = shape.y.baseVal.value
    const width = shape.width.baseVal.value
    const height = shape.height.baseVal.value
    const radius = Math.min(parseFloat(style.rx) || shape.rx.baseVal.value, width / 2, height / 2)
    if (!radius) return renderer.rectangle(x, y, width, height, options)
    return renderer.path(
      `M${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height - radius} Q${x + width},${y + height} ${x + width - radius},${y + height} H${x + radius} Q${x},${y + height} ${x},${y + height - radius} V${y + radius} Q${x},${y} ${x + radius},${y} Z`,
      options,
    )
  }
}
