import type { Diagram } from 'mermaid/dist/Diagram.js'
import type { FlowDB } from 'mermaid/dist/diagrams/flowchart/flowDb.js'
import type { FlowSubGraph, FlowVertex, FlowClass } from 'mermaid/dist/diagrams/flowchart/types.js'
import { colorIndex, getPalette } from '../../themes/src/index'
import type { Theme, ColorMode } from '../../themes/src/index'

export interface FlowColors {
  vertices: FlowVertex[]
  groups: FlowSubGraph[]
  classes: Map<string, FlowClass>
  edges: { start: string; end: string }[]
}

export function readFlowColors(diagram: Diagram): FlowColors | undefined {
  if (!diagram.type.startsWith('flowchart') || !('getVertices' in diagram.db)) return
  const db = diagram.db as FlowDB
  return {
    vertices: [...db.getVertices().values()].map(node => ({ ...node, styles: [...node.styles], classes: [...node.classes] })),
    groups: db.getSubGraphs().map(group => ({ ...group, nodes: [...group.nodes], classes: [...group.classes] })),
    classes: new Map(db.getClasses()),
    edges: db.getEdges().map(({ start, end }) => ({ start, end })),
  }
}

export function flowColorKeys(model: FlowColors) {
  const groups = new Map(model.groups.map(group => [group.id, group]))
  const parents = new Map<string, string>()
  for (const group of model.groups) for (const node of group.nodes) if (groups.has(node)) parents.set(node, group.id)
  function ancestry(id: string) {
    const path = [id]
    while (parents.has(path[0])) {
      const parent = parents.get(path[0])
      if (!parent || path.includes(parent)) break
      path.unshift(parent)
    }
    return path
  }
  const keys = new Map<string, string>()
  const depth = new Map<string, number>()
  for (const group of model.groups) {
    const path = ancestry(group.id)
    const pending = [...group.nodes]
    const seen = new Set<string>()
    keys.set(group.id, `group:${path[0]}`)
    while (pending.length) {
      const id = pending.pop()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nested = groups.get(id)
      if (nested) pending.push(...nested.nodes)
      else if ((depth.get(id) ?? 0) <= path.length) {
        depth.set(id, path.length)
        keys.set(id, `group:${path[0]}`)
      }
    }
  }
  // A tree has unambiguous ownership. Shared dependencies and cycles use stable
  // per-node colors instead of pretending they belong to one parent's branch.
  if (!groups.size && model.vertices.length > 2) {
    const children = new Map(model.vertices.map(node => [node.id, [] as string[]]))
    const incoming = new Map(model.vertices.map(node => [node.id, 0]))
    for (const edge of model.edges) {
      children.get(edge.start)?.push(edge.end)
      incoming.set(edge.end, (incoming.get(edge.end) ?? 0) + 1)
    }
    const roots = model.vertices.filter(node => !incoming.get(node.id))
    if (roots.length === 1 && [...incoming.values()].every(count => count <= 1) && (children.get(roots[0].id)?.length ?? 0) > 1) {
      const branches = children.get(roots[0].id) ?? []
      const visited = new Set<string>([roots[0].id])
      for (const branch of branches) {
        const pending = [branch]
        while (pending.length) {
          const id = pending.pop()
          if (!id || visited.has(id)) continue
          visited.add(id)
          keys.set(id, `branch:${branch}`)
          pending.push(...children.get(id) ?? [])
        }
      }
      if (visited.size !== model.vertices.length) keys.clear()
    }
  }
  for (const node of model.vertices) if (!keys.has(node.id)) keys.set(node.id, `node:${node.id}`)
  return keys
}

export function applyColors(svg: SVGSVGElement, model: FlowColors | undefined, theme: Theme, mode: ColorMode) {
  const palette = getPalette(theme, mode)
  const keys = model ? flowColorKeys(model) : new Map<string, string>()
  const families = [...new Set([...keys.values()].filter(key => !key.startsWith('node:')))].sort()
  const slots = new Map<string, number>()
  const used = new Set<number>()
  for (const key of families) {
    let slot = colorIndex(key)
    if (used.size < palette.colors.length) while (used.has(slot)) slot = (slot + 1) % palette.colors.length
    slots.set(key, slot)
    used.add(slot)
  }
  const prefix = svg.id + '-flowchart-'
  const authored = (id: string, classes: string[] = []) => {
    const node = model?.vertices.find(node => node.id === id)
    const styles = [...node?.styles ?? [], ...[...classes, ...node?.classes ?? [], 'default'].flatMap(name => model?.classes.get(name)?.styles ?? [])]
    return styles.some(style => /(?:^|;)\s*(?:fill|stroke|color)\s*:/i.test(style))
  }
  function paint(graphic: SVGElement, id: string, group: boolean) {
    const key = keys.get(id) ?? `node:${id}`
    const fill = palette.colors[slots.get(key) ?? colorIndex(key)]
    graphic.dataset.flairColorGroup = key
    for (const text of graphic.querySelectorAll<SVGElement>('text,tspan')) {
      text.style.setProperty('fill', group ? palette.text : palette.nodeText, 'important')
      text.style.setProperty('color', group ? palette.text : palette.nodeText, 'important')
    }
    for (const shape of graphic.querySelectorAll<SVGElement>('rect.label-container, polygon.label-container, path.label-container, circle.label-container, ellipse.label-container, rect.actor, rect:not(.label-container), polygon:not(.label-container)')) {
      if (shape.closest('.label')) continue
      shape.style.setProperty('fill', group ? `color-mix(in srgb, ${fill} 14%, ${palette.background})` : fill, 'important')
      shape.style.setProperty('stroke', mode === 'dark' && !group ? `color-mix(in srgb, ${fill} 60%, ${palette.nodeText})` : palette.border, 'important')
    }
  }
  if (model) {
    for (const graphic of svg.querySelectorAll<SVGElement>('.node')) {
      const id = graphic.id.startsWith(prefix) ? graphic.id.slice(prefix.length).replace(/-\d+$/, '') : graphic.dataset.id
      if (id && !authored(id)) paint(graphic, id, false)
    }
    for (const graphic of svg.querySelectorAll<SVGElement>('.cluster')) {
      const group = model.groups.find(group => graphic.id === group.id || graphic.id === svg.id + '-' + group.id)
      if (group && !authored(group.id, group.classes)) paint(graphic, group.id, true)
    }
  } else {
    for (const participant of svg.querySelectorAll<SVGElement>('[data-et="participant"]')) {
      paint(participant, participant.dataset.id ?? participant.id, false)
    }
    for (const box of svg.querySelectorAll<SVGRectElement>('rect.actor-bottom[name]')) {
      if (box.parentElement instanceof SVGElement) paint(box.parentElement, box.getAttribute('name') ?? '', false)
    }
    // Actor glyph labels sit on the canvas, including the non-selectable footer
    // copies. Boxed participants use nodeText; these labels need canvas text.
    for (const actor of svg.querySelectorAll<SVGElement>('g.actor-man')) {
      actor.style.setProperty('stroke', palette.border, 'important')
      for (const text of actor.querySelectorAll<SVGElement>('text,tspan')) {
        text.style.setProperty('fill', palette.text, 'important')
        text.style.setProperty('color', palette.text, 'important')
      }
    }
  }
}
