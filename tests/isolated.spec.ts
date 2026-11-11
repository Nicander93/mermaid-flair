import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { getDiagramBlocks } from '../packages/source/src/markdown'
import type { createIsolatedRenderer } from '../packages/renderer/src/isolated'
import type { mountDiagram } from '../packages/viewer/src/index'

declare global {
  interface Window {
    isolatedHarness: { createIsolatedRenderer: typeof createIsolatedRenderer; mountDiagram: typeof mountDiagram }
    disposeIsolatedReview: () => void
    changeIsolatedReview: () => Promise<void>
  }
}

test('cancels obsolete isolated renders and finishes the latest theme after rapid appearance changes', async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: "import { createIsolatedRenderer } from './packages/renderer/src/isolated'; import { mountDiagram } from './packages/viewer/src/index'; window.isolatedHarness = {createIsolatedRenderer, mountDiagram}",
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', target: 'chrome130',
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://flair-isolated.test/styles.css', route => route.fulfill({ path: 'dist/vscode/dist/styles.css' }))
  await page.route('https://flair-isolated.test/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><main></main>',
  }))
  await page.goto('https://flair-isolated.test/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const frame = readFileSync('dist/test/renderer-frame.js', 'utf8')
  const source = getDiagramBlocks(readFileSync('fixtures/mermaid/app-overview.md', 'utf8'))[0].source
  await page.evaluate(({ frame, source }) => {
    const { createIsolatedRenderer, mountDiagram } = window.isolatedHarness
    const renderer = createIsolatedRenderer(document, frame)
    const diagrams = Array.from({ length: 5 }, () => {
      const host = document.body.appendChild(document.createElement('section'))
      return mountDiagram(host, source, {
        render: renderer.render, preferences: { theme: 'sketch', followHost: true, hoverToolbar: true },
        colorMode: 'dark', title: 'Architecture', filename: 'architecture.svg', save() {},
      })
    })
    window.disposeIsolatedReview = () => { diagrams.forEach(diagram => diagram.dispose()); renderer.dispose() }
    window.changeIsolatedReview = async () => {
      for (let index = 0; index < 15; index++) {
        const theme = (['sketch', 'modern', 'sketch-paper'] as const)[index % 3]
        for (const diagram of diagrams) diagram.update({ theme, followHost: true, hoverToolbar: true }, index % 2 ? 'dark' : 'light')
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      for (const diagram of diagrams) diagram.update({ theme: 'sketch-paper', followHost: true, hoverToolbar: true }, 'dark')
    }
  }, { frame, source })
  await expect(page.locator('.flair-inline-surface svg')).toHaveCount(5)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.evaluate(() => window.changeIsolatedReview())
  await expect(page.locator('.flair-diagram[data-theme="sketch-paper"][data-mode="dark"]:not([aria-busy])')).toHaveCount(5, { timeout: 10_000 })
  await expect(page.locator('.flair-error')).toHaveCount(0)
  const outputs = await page.locator('.flair-inline-surface svg').evaluateAll(svgs => svgs.map(svg => ({
    id: Number(svg.id.replace('flair-', '')), background: svg.firstElementChild?.getAttribute('fill'),
  })))
  expect(outputs.every(output => output.background === '#24221e')).toBe(true)
  expect(Math.max(...outputs.map(output => output.id))).toBeLessThan(40)
  await page.evaluate(() => window.disposeIsolatedReview())
  await expect(page.locator('.flair-render-frame')).toHaveCount(0)
  expect(errors).toEqual([])
})
