import { chromium, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'

const source = (await readFile('fixtures/mermaid/quick-start.md', 'utf8')).replaceAll('\r\n', '\n').split('```mermaid\n')[1].split('```')[0]
await mkdir('docs/images', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.FLAIR_CHROMIUM })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
  await page.route('https://flair-docs.test/preview.js', route => route.fulfill({ path: 'dist/vscode/dist/preview.js' }))
  await page.route('https://flair-docs.test/styles.css', route => route.fulfill({ path: 'dist/vscode/dist/styles.css' }))
  await page.route('https://flair-docs.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; script-src 'nonce-docs'; style-src 'self' 'unsafe-inline'">
    <link rel="stylesheet" href="/styles.css"><main id="flair-preview" class="flair-preview"></main>
    <script nonce="docs">window.flairReady=false;function acquireVsCodeApi(){return{postMessage:message=>{if(message.type==='ready')window.flairReady=true}}}</script>
    <script nonce="docs" src="/preview.js"></script>` }))
  await page.goto('https://flair-docs.test/')
  await expect.poll(() => page.evaluate(() => window.flairReady)).toBe(true)
  for (const [theme, mode, filename] of [
    ['sketch', 'light', 'whiteboard-light'], ['sketch', 'dark', 'whiteboard-dark'],
    ['modern', 'light', 'clean-light'], ['sketch-paper', 'light', 'paper-light'],
  ]) {
    await page.evaluate(state => window.postMessage(state, '*'), {
      name: 'Quick start', diagrams: [{ line: 3, source }],
      preferences: { theme, followHost: true, hoverToolbar: true }, colorMode: mode, fontFamily: 'Consolas, monospace',
    })
    const figure = page.locator('.flair-diagram')
    await expect(figure).toHaveAttribute('data-theme', theme)
    await expect(figure).toHaveAttribute('data-mode', mode)
    await expect(figure).not.toHaveAttribute('aria-busy', 'true')
    await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
    await expect(figure.locator('.flair-error')).toHaveCount(0)
    await page.mouse.move(0, 0)
    await figure.screenshot({ path: `docs/images/${filename}.png` })
  }
  console.log('Generated four documentation images from the bundled renderer.')
} finally { await browser.close() }
