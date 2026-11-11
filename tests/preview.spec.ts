import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { getDiagramBlocks } from '../packages/source/src/markdown'
import { defaults, getPalette, themes } from '../packages/themes/src/index'
import { diagrams, menu, openPreview, sendState } from './preview-fixture'

test('renders ten blocks offline and replaces only an edited block', async ({ page }) => {
  const network: string[] = []
  page.on('request', request => { if (!request.url().startsWith('https://flair.test/')) network.push(request.url()) })
  const state = await openPreview(page)
  const figures = page.locator('.flair-diagram')
  await expect(figures).toHaveCount(10)
  await expect(figures.locator('.flair-inline-surface svg')).toHaveCount(9)
  await expect(figures.locator('.flair-error')).toHaveCount(1)
  await expect(figures.locator('.flair-error details')).not.toHaveAttribute('open', '')
  const first = await figures.first().locator('.flair-inline-surface svg').getAttribute('id')
  const changed = [...state.diagrams]
  changed[6] = { ...changed[6], source: 'flowchart TD\n A[Recovered] --> B[Valid]' }
  await sendState(page, { ...state, diagrams: changed })
  await expect(figures.locator('.flair-inline-surface svg')).toHaveCount(10)
  await expect(figures.first().locator('.flair-inline-surface svg')).toHaveAttribute('id', first ?? '')
  expect(network).toEqual([])
})

test('has only two icon controls and a four-control popup without selection panels', async ({ page }, info) => {
  await openPreview(page, { diagrams: diagrams.slice(0, 1) })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await expect(figure.locator('.flair-diagram-tools button')).toHaveCount(2)
  await expect(figure.locator('select,footer')).toHaveCount(0)
  await figure.focus()
  await figure.getByRole('button', { name: 'Expand diagram', exact: true }).click()
  const viewer = page.getByRole('dialog')
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('button')).toHaveCount(4)
  await expect(viewer.locator('header strong,footer,textarea,select')).toHaveCount(0)
  await viewer.locator('.flair-svg-surface').getByRole('button', { name: /^node ·/ }).first().press('Enter')
  await expect(viewer).toHaveAttribute('data-selected-count', '1')
  await expect(viewer.locator('button')).toHaveCount(4)
  const bounds = await viewer.boundingBox()
  expect(bounds?.x).toBeGreaterThan(0)
  expect(bounds?.width).toBeLessThan(1160)
  await viewer.screenshot({ path: info.outputPath('simple-popup.png') })
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(figure).toBeFocused()
  await figure.screenshot({ path: info.outputPath('simple-controls.png') })
})

test('copies a complete clean PNG regardless of selection and zoom', async ({ page }) => {
  await openPreview(page, { diagrams: [{ line: 1, source: 'flowchart LR\n A[Draft] --> B[Review]' }] })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await figure.focus()
  await figure.getByRole('button', { name: 'Copy image', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.flairImages.length)).toBe(1)
  const original = await page.evaluate(() => window.flairImages[0])
  const png = Buffer.from(original, 'base64')
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  const width = await figure.locator('.flair-inline-surface svg').evaluate(svg => Number(svg.getAttribute('width')))
  expect(png.readUInt32BE(16)).toBe(width * 2)
  await figure.getByRole('button', { name: 'node · Draft', exact: true }).click()
  await figure.focus()
  await figure.getByRole('button', { name: 'Expand diagram' }).click()
  const viewer = page.getByRole('dialog')
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await menu(page, viewer, 'Copy image')
  await expect.poll(() => page.evaluate(() => window.flairImages.length)).toBe(2)
  expect(await page.evaluate(() => window.flairImages[1])).toBe(original)
  expect(await page.evaluate(() => window.flairMessages.some(message => message.type === 'copy'))).toBe(false)
})

test('keeps pan, zoom, reset, keyboard selection and advanced exports', async ({ page }) => {
  await openPreview(page, { diagrams: diagrams.slice(0, 1) })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await figure.press('Enter')
  const viewer = page.getByRole('dialog')
  const initial = await viewer.getByLabel('Zoom level').textContent()
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(viewer.getByLabel('Zoom level')).not.toHaveText(initial ?? '')
  await viewer.getByRole('button', { name: 'Reset view' }).click()
  await expect(viewer.getByLabel('Zoom level')).toHaveText(initial ?? '')
  const surface = viewer.locator('.flair-svg-surface')
  const before = await surface.getAttribute('style')
  const viewport = viewer.locator('.flair-viewport')
  await viewport.press('ArrowRight')
  await expect(surface).not.toHaveAttribute('style', before ?? '')
  await menu(page, viewer, 'Export SVG…')
  await expect.poll(() => page.evaluate(() => window.flairMessages.some(message => message.type === 'export'))).toBe(true)
  await menu(page, viewer, 'Save image…')
  await expect.poll(() => page.evaluate(() => window.flairMessages.some(message => message.type === 'exportPng'))).toBe(true)
  const exported = await page.evaluate(() => window.flairMessages.find(message => message.type === 'export'))
  expect(exported?.svg).not.toMatch(/data-flair-highlight|data-flair-hit-area|aria-pressed|foreignObject|<script/)
})

test('automatically colors explicit groups and keeps colors stable after source reordering', async ({ page }, info) => {
  const source = 'flowchart LR\n subgraph backend[Backend]\n A[API] --> B[Store]\n end\n subgraph frontend[Frontend]\n C[View] --> D[Panel]\n end\n A --> C'
  const state = await openPreview(page, { diagrams: [{ line: 1, source }] })
  const colors = () => page.locator('.node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.textContent?.trim(), { group: node.getAttribute('data-flair-color-group'), fill: getComputedStyle(node.querySelector('.label-container') ?? node.querySelector('path') ?? node).fill }])))
  await expect(page.locator('.flair-inline-surface svg')).toBeVisible()
  const first = await colors()
  expect(first.API.group).toBe(first.Store.group)
  expect(first.View.group).toBe(first.Panel.group)
  expect(first.API.fill).not.toBe(first.View.fill)
  await sendState(page, { ...state, diagrams: [{ line: 1, source: source.replace('A[API] --> B[Store]', 'Z[New]\n B[Store]\n A[API] --> B') }] })
  await expect(page.getByRole('button', { name: 'node · New' })).toBeVisible()
  const next = await colors()
  expect(next.API).toEqual(first.API)
  expect(next.View).toEqual(first.View)
  await page.locator('.flair-diagram').screenshot({ path: info.outputPath('automatic-groups.png') })
})

test('respects author colors and restores only selected geometry and arrows', async ({ page }) => {
  await openPreview(page, { diagrams: [{ line: 1, source: 'flowchart LR\n A[Draft] --> B[Review] --> C[Publish]\n classDef special fill:#d3f9d8,stroke:#2b8a3e,color:#1b4332\n class C special' }] })
  const figure = page.locator('.flair-diagram')
  const node = figure.getByRole('button', { name: 'node · Publish', exact: true })
  await expect(node).toBeVisible()
  const fill = () => node.locator('.flair-sketch-shape path').first().evaluate(shape => getComputedStyle(shape).fill)
  expect(await fill()).toBe('rgb(211, 249, 216)')
  await node.click()
  await expect(figure).toHaveAttribute('data-selected-count', '1')
  await node.press('Escape')
  await page.mouse.move(0, 0)
  await node.evaluate(element => (element as SVGElement).blur())
  expect(await fill()).toBe('rgb(211, 249, 216)')
  const edges = figure.locator('.flowchart-link')
  const untouched = await edges.nth(1).getAttribute('style')
  await edges.first().press('Enter')
  await expect(edges.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(figure.locator('[data-flair-selection-overlay]')).toHaveCount(0)
  await expect(figure.locator('marker[id*="flair-marker"]')).not.toHaveCount(0)
  expect(await edges.nth(1).getAttribute('style')).toBe(untouched)
})

test('renders the reported shell diagram with every theme in both modes', async ({ page }, info) => {
  const source = getDiagramBlocks(readFileSync('fixtures/mermaid/layered-shell.md', 'utf8'))[0].source
  const state = await openPreview(page, { diagrams: [{ line: 1, source }] })
  for (const theme of themes) for (const mode of ['light', 'dark'] as const) {
    await sendState(page, { ...state, preferences: { ...defaults, theme }, colorMode: mode })
    const figure = page.locator('.flair-diagram')
    await expect(figure).toHaveAttribute('data-theme', theme)
    await expect(figure).not.toHaveAttribute('aria-busy', 'true')
    await expect(figure.locator('.flair-error')).toHaveCount(0)
    await expect(figure.getByRole('button', { name: 'node · shell 外壳与布局', exact: true })).toBeVisible()
    await figure.screenshot({ path: info.outputPath(`${theme}-${mode}.png`) })
  }
})

test('keeps hand-drawn node contours joined at corners in the reported overview', async ({ page }, info) => {
  const source = getDiagramBlocks(readFileSync('fixtures/mermaid/app-overview.md', 'utf8'))[0].source
  await page.setViewportSize({ width: 1500, height: 1100 })
  await openPreview(page, { diagrams: [{ line: 1, source }], colorMode: 'dark', fontFamily: 'Consolas, "Microsoft YaHei", monospace' })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await figure.screenshot({ path: info.outputPath('overview-dark.png') })
  const gaps = await figure.locator('.node .label-container path[fill="none"]').evaluateAll(paths => paths.flatMap(path => {
    const gaps: number[] = []
    let first: number[] | undefined
    let end: number[] | undefined
    // Rough.js serializes absolute moves and cubic curves. A separate move may
    // start a new stroke, but it must meet the previous segment at the corner.
    for (const [, command, coordinates] of path.getAttribute('d')?.matchAll(/([MLC])([^MLCZ]*)/g) ?? []) {
      const values = coordinates.trim().split(/[\s,]+/).map(Number)
      if (command === 'M') {
        first ??= values
        if (end) gaps.push(Math.hypot(values[0] - end[0], values[1] - end[1]))
      }
      end = values.slice(-2)
    }
    if (first && end) gaps.push(Math.hypot(first[0] - end[0], first[1] - end[1]))
    return gaps
  }))
  expect(gaps.length).toBeGreaterThan(20)
  expect(Math.max(...gaps)).toBeLessThan(0.01)
})

test('uses pastel nodes with separate canvas text and stronger dark connections while keeping authored styles', async ({ page }, info) => {
  const source = 'flowchart LR\n subgraph backend[Backend 后端]\n A[Draft] -->|send| B[Review]\n end\n C[Authored] --> B\n classDef explicit fill:#243444,stroke:#ff8800,color:#fafafa\n class C explicit\n linkStyle 1 stroke:#ff8800,stroke-width:1px'
  const state = await openPreview(page, { diagrams: [{ line: 1, source }], colorMode: 'dark' })
  const figure = page.locator('.flair-diagram')
  for (const theme of themes) {
    await sendState(page, { ...state, preferences: { ...defaults, theme } })
    await expect(figure).toHaveAttribute('data-theme', theme)
    await expect(figure).not.toHaveAttribute('aria-busy', 'true')
    const draft = figure.getByRole('button', { name: 'node · Draft', exact: true })
    await expect(draft).toBeVisible()
    await expect(draft.locator('text').first()).toHaveCSS('fill', 'rgb(38, 49, 58)')
    const canvasText = getPalette(theme, 'dark').text
    const expectedCanvasText = `rgb(${[1, 3, 5].map(offset => parseInt(canvasText.slice(offset, offset + 2), 16)).join(', ')})`
    await expect(figure.locator('.cluster-label text').first()).toHaveCSS('fill', expectedCanvasText)
    await expect(figure.locator('.edgeLabel text').first()).toHaveCSS('fill', expectedCanvasText)
    const strokes = await figure.locator('.flowchart-link').evaluateAll(edges => edges.map(edge => {
      const path = edge.matches('path') ? edge : [...edge.querySelectorAll('path:not([data-flair-hit-area])')].at(-1)
      const style = getComputedStyle(path ?? edge)
      const markerId = /#([^\s)"']+)/.exec(style.markerEnd)?.[1]
      const marker = markerId ? edge.closest('svg')?.querySelector(`[id="${CSS.escape(markerId)}"] path`) : undefined
      return { stroke: style.stroke, width: style.strokeWidth, arrow: marker ? getComputedStyle(marker).fill : undefined }
    }))
    expect(strokes[0]).toEqual({ stroke: 'rgb(182, 194, 207)', width: '2px', arrow: 'rgb(182, 194, 207)' })
    expect(strokes[1].stroke).toBe('rgb(255, 136, 0)')
    expect(strokes[1].width).toBe('1px')
    const authored = figure.getByRole('button', { name: 'node · Authored', exact: true })
    await expect(authored.locator('text').first()).toHaveCSS('fill', 'rgb(250, 250, 250)')
    await figure.screenshot({ path: info.outputPath(`${theme}-dark-labels.png`) })
  }
  await figure.focus()
  await figure.getByRole('button', { name: 'Copy image', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.flairImages.length)).toBe(1)
  await menu(page, figure, 'Export SVG…')
  await expect.poll(() => page.evaluate(() => window.flairMessages.some(message => message.type === 'export'))).toBe(true)
})

test('preserves selection and an open popup when appearance or code font changes', async ({ page }) => {
  const state = await openPreview(page, { diagrams: diagrams.slice(0, 1), fontFamily: 'Consolas' })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await figure.getByRole('button', { name: /^node ·/ }).first().press('Enter')
  await figure.press('Enter')
  const viewer = page.getByRole('dialog')
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const zoom = await viewer.getByLabel('Zoom level').textContent()
  await sendState(page, { ...state, colorMode: 'dark', fontFamily: '"Courier New"' })
  await expect(figure).not.toHaveAttribute('aria-busy', 'true')
  await expect(viewer).toHaveAttribute('data-selected-count', '1')
  await expect(viewer.locator('svg text').first()).toHaveCSS('font-family', /Courier New/)
  expect(zoom).toBeTruthy()
  await expect(viewer.locator('button')).toHaveCount(4)
})

test('keeps diagram type samples and unsafe content isolated', async ({ page }, info) => {
  const state = await openPreview(page, { diagrams: [diagrams[1], diagrams[2], diagrams[3], diagrams[4], diagrams[5], diagrams[7], diagrams[8], diagrams[9]] })
  await expect(page.locator('.flair-inline-surface svg')).toHaveCount(8)
  await expect(page.locator('.flair-error')).toHaveCount(0)
  const actors = await page.locator('.flair-diagram').first().locator('[data-et="participant"] .actor').evaluateAll(shapes => shapes.map(shape => getComputedStyle(shape).fill))
  expect(actors.length).toBeGreaterThanOrEqual(3)
  expect(new Set(actors).size).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'participant · Client', exact: true }).first().click()
  await expect(page.locator('.flair-diagram').first()).toHaveAttribute('data-selected-count', '1')
  await page.getByRole('button', { name: 'participant · Client', exact: true }).first().press('Escape')
  await sendState(page, { ...state, colorMode: 'dark' })
  const figures = page.locator('.flair-diagram')
  await expect(figures.first()).toHaveAttribute('data-mode', 'dark')
  await expect(page.locator('.flair-diagram[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('.flair-error')).toHaveCount(0)
  const sequence = figures.first()
  await expect(sequence.locator('.actor-man text tspan').first()).toHaveCSS('fill', 'rgb(226, 231, 237)')
  await expect(sequence.locator('.messageText').first()).toHaveCSS('fill', 'rgb(226, 231, 237)')
  await expect(sequence.locator('.noteText').first()).toHaveCSS('fill', 'rgb(38, 49, 58)')
  const participantColors = await sequence.locator('.actor[name]').evaluateAll(boxes => boxes.map(box => ({
    name: box.getAttribute('name'), fill: getComputedStyle(box).fill,
  })))
  for (const name of ['C', 'A', 'R']) {
    const copies = participantColors.filter(box => box.name === name)
    expect(copies).toHaveLength(2)
    expect(copies[0].fill).toBe(copies[1].fill)
  }
  for (const index of [1, 2, 3, 5]) await expect(figures.nth(index).locator('.node text').first()).toHaveCSS('fill', 'rgb(38, 49, 58)')
  await expect(figures.nth(7).locator('.slice').first()).toHaveCSS('fill', 'rgb(38, 49, 58)')
  await expect(figures.nth(7).locator('.legend text').first()).toHaveCSS('fill', 'rgb(226, 231, 237)')
  for (let index = 0; index < 8; index++) await figures.nth(index).screenshot({ path: info.outputPath(`type-${index}-dark.png`) })
})

test('blocks external content even with permissive diagram frontmatter', async ({ page }) => {
  const external: string[] = []
  await page.route('https://external.test/**', route => { external.push(route.request().url()); return route.abort() })
  await openPreview(page, { diagrams: [{ line: 1, source: '---\nconfig:\n securityLevel: loose\n htmlLabels: true\n themeCSS: "@import url(https://external.test/style.css);"\n---\nflowchart LR\n A[Safe] --> B[Finish]\n click A href "https://external.test/link"' }] })
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await menu(page, figure, 'Export SVG…')
  const exported = await page.waitForFunction(() => window.flairMessages.find(message => message.type === 'export')).then(value => value.jsonValue())
  expect(exported?.svg).not.toMatch(/external.test|foreignObject|<script|<a[\s>]/)
  expect(external).toEqual([])
})
