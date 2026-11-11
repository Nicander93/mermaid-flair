import { expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { getDiagramBlocks } from '../packages/source/src/markdown'
import type { PreviewMessage, PreviewState } from '../apps/vscode/src/messages'
import { defaults } from '../packages/themes/src/index'

declare global {
  interface Window { flairMessages: PreviewMessage[]; flairImages: string[] }
}

export const diagrams = getDiagramBlocks(readFileSync('fixtures/mermaid/multi-diagram.md', 'utf8'))
export async function sendState(page: Page, state: PreviewState) { await page.evaluate(value => window.postMessage(value, '*'), state) }
export async function menu(page: Page, host: Locator, name: string) {
  await host.dispatchEvent('contextmenu', { clientX: 100, clientY: 100 })
  await page.getByRole('menuitem', { name, exact: true }).click()
}

export async function openPreview(page: Page, override: Partial<PreviewState> = {}) {
  const root = 'https://flair.test'
  await page.route(root + '/preview.js', route => route.fulfill({ path: 'dist/vscode/dist/preview.js' }))
  await page.route(root + '/styles.css', route => route.fulfill({ path: 'dist/vscode/dist/styles.css' }))
  await page.route(root + '/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; script-src 'nonce-flair'; style-src 'self' 'unsafe-inline'">
    <link rel="stylesheet" href="/styles.css"><main id="flair-preview" class="flair-preview"></main>
    <script nonce="flair">
      window.flairMessages=[];window.flairImages=[];
      function acquireVsCodeApi(){return{postMessage:message=>flairMessages.push(message)}}
      Object.defineProperty(navigator,'clipboard',{value:{
        writeText:async text=>{flairMessages.push({type:'copy',text})},
        write:async items=>{for(const item of items){const blob=await item.getType('image/png');
          const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});
          flairImages.push(base64)}}
      }});
    </script><script nonce="flair" src="/preview.js"></script>` }))
  await page.goto(root)
  await expect.poll(() => page.evaluate(() => window.flairMessages[0]?.type)).toBe('ready')
  const state = { name: 'Regression.md', diagrams, preferences: defaults, colorMode: 'light', ...override } satisfies PreviewState
  await sendState(page, state)
  return state
}
