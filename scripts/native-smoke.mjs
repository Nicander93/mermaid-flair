import { spawn } from 'node:child_process'
import { checkClipboardImage } from './clipboard-image.mjs'
import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { chromium, expect } from '@playwright/test'

const [host, executable] = process.argv.slice(2)
const custom = process.argv.includes('--custom')
if (!['vscode', 'cursor'].includes(host) || !executable) throw new Error('Usage: node scripts/native-smoke.mjs vscode|cursor <executable>')
const root = resolve('.local/native', (host === 'cursor' ? 'cursor-no-agents' : host) + (custom ? '-custom' : ''), Date.now().toString(36))
console.log('Artifacts:', root)
const disabledExtensions = []
if (host === 'cursor') {
  const bundled = resolve(dirname(executable), 'resources/app/extensions')
  for (const directory of await readdir(bundled, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue
    try {
      const manifest = JSON.parse(await readFile(resolve(bundled, directory.name, 'package.json'), 'utf8'))
      if (manifest.publisher && manifest.publisher !== 'vscode') disabledExtensions.push(`${manifest.publisher}.${manifest.name}`)
    } catch {}
  }
  if (!disabledExtensions.includes('anysphere.cursor-agent-exec')) throw new Error('Cursor agent extension inventory is incomplete.')
}
const profile = resolve(root, 'profile')
const harness = resolve(root, 'harness')
const request = resolve(root, 'request.json')
const response = resolve(root, 'response.json')
await mkdir(resolve(profile, 'User'), { recursive: true })
await mkdir(harness, { recursive: true })
await writeFile(resolve(root, 'disabled-extensions.json'), JSON.stringify(disabledExtensions, null, 2))
await writeFile(resolve(profile, 'User/settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none', 'extensions.autoUpdate': false,
  'mermaidFlair.theme': 'sketch', 'update.mode': 'none',
}))
await cp('fixtures/mermaid/multi-diagram.md', resolve(root, 'sample.md'))
await writeFile(resolve(harness, 'package.json'), JSON.stringify({
  name: 'native-smoke', publisher: 'mermaid-flair', version: '0.0.1',
  engines: { vscode: '^1.96.0' }, main: 'main.cjs', activationEvents: ['onLanguage:markdown'],
  extensionDependencies: ['mermaid-flair.mermaid-flair'],
}))
await writeFile(resolve(harness, 'main.cjs'), `
const vscode = require('vscode'), fs = require('node:fs')
exports.activate = async context => {
  const previousClipboard = await vscode.env.clipboard.readText()
  const doc = await vscode.workspace.openTextDocument(${JSON.stringify(resolve(root, 'sample.md'))})
  await vscode.window.showTextDocument(doc)
  await vscode.commands.executeCommand(${custom ? "'vscode.openWith', doc.uri, 'vscode.markdown.preview.editor'" : "'markdown.showPreviewToSide', doc.uri"})
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
    fs.writeFileSync(${JSON.stringify(response)}, JSON.stringify({
      line: event.selections[0].start.line, text: event.textEditor.document.getText(event.selections[0])
    }))
  }))
  const listener = async () => {
    try {
      const value = JSON.parse(fs.readFileSync(${JSON.stringify(request)}, 'utf8'))
      if (value.flairAction === 'clipboard') {
        const copied = (await vscode.env.clipboard.readText()).includes('API gateway')
        await vscode.env.clipboard.writeText(previousClipboard)
        fs.writeFileSync(${JSON.stringify(response)}, JSON.stringify({ copied }))
        return
      }
      await vscode.commands.executeCommand('mermaidFlair.revealNativeSource', value)
    }
    catch (error) { fs.writeFileSync(${JSON.stringify(response)}, JSON.stringify({ error: String(error) })) }
  }
  fs.watchFile(${JSON.stringify(request)}, { interval: 200 }, listener)
  context.subscriptions.push({ dispose: () => fs.unwatchFile(${JSON.stringify(request)}, listener) })
}
`)
const child = spawn(executable, [
  '--remote-debugging-port=0', '--user-data-dir', profile,
  '--disable-gpu',
  '--extensions-dir', resolve(root, 'extensions'), '--disable-workspace-trust', '--skip-welcome',
  '--extensionDevelopmentPath=' + resolve('dist/vscode'),
  '--extensionDevelopmentPath=' + harness,
  ...disabledExtensions.flatMap(id => ['--disable-extension', id]),
  resolve(root, 'sample.md'),
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, APPDATA: root, LOCALAPPDATA: root, USERPROFILE: root, HOME: root } })
let log = ''
child.stderr.on('data', chunk => { log = (log + chunk.toString()).slice(-4000) })
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(() => reject(new Error('Host startup timeout. ' + log)), 20000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Host exited: ' + code + ' ' + log)) })
    child.stderr.on('data', () => {
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log)
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]) }
    })
  })
  const browser = await chromium.connectOverCDP(endpoint)
  try {
    const context = browser.contexts()[0]
    console.log('Host pages:', context.pages().map(page => page.url().split('?')[0]))
    const page = context.pages().find(page => page.url().includes('workbench')) ?? context.pages()[0] ?? await context.waitForEvent('page')
    const body = page.frameLocator('iframe.webview').frameLocator('iframe#active-frame')
    const diagrams = body.locator('.flair-native-diagram .flair-diagram')
    try { await expect(diagrams).toHaveCount(10, { timeout: 30000 }) }
    catch (error) {
      await page.screenshot({ path: resolve(root, 'startup-failure.png'), timeout: 5000 }).catch(() => {})
      console.log('Visible workbench:', (await page.locator('body').innerText({ timeout: 5000 })).slice(0, 1500))
      throw error
    }
    await expect(diagrams.locator('.flair-inline-surface svg')).toHaveCount(9)
    await expect(diagrams.locator('.flair-error')).toHaveCount(1)
    await expect(body.getByRole('heading', { name: 'Mermaid Flair regression note' })).toBeVisible()
    const first = diagrams.first()
    const nodes = first.locator('.flair-inline-surface').getByRole('button', { name: /^node ·/ })
    await nodes.first().press('Enter')
    const onboarding = host === 'cursor' && await page.getByText('Log In', { exact: true }).first().isVisible()
    if (!onboarding) {
      await first.getByRole('button', { name: 'Copy image', exact: true }).press('Enter')
      await expect(first.locator('.flair-status')).toHaveText('Done.')
      await checkClipboardImage()
      await writeFile(request, JSON.stringify({ flairAction: 'clipboard' }))
      await expect.poll(async () => JSON.parse(await readFile(response, 'utf8'))).toHaveProperty('copied')
    } else console.log('Cursor onboarding obscures native mouse and clipboard validation; renderer and keyboard checks continue.')
    await nodes.nth(1).press('Control+Enter')
    await expect(first.getByLabel('Selected element count')).toHaveText('2 selected')
    await expect(first.locator('[data-flair-selection-overlay]')).toHaveCount(0)
    await nodes.first().press('Escape')
    await nodes.first().press('Enter')
    await page.screenshot({ path: resolve(root, 'native-selection.png') })
    await first.press('Enter')
    const viewer = body.getByRole('dialog')
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('button')).toHaveCount(4)
    await viewer.getByRole('button', { name: 'Zoom in', exact: true }).press('Enter')
    if (host === 'vscode') {
      const session = await browser.newBrowserCDPSession()
      await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: root, eventsEnabled: true })
      const download = new Promise((resolveDownload, reject) => {
        const timer = setTimeout(() => reject(new Error('Native SVG download did not start.')), 5000)
        session.once('Browser.downloadWillBegin', result => { clearTimeout(timer); resolveDownload(result) })
      })
      await viewer.dispatchEvent('contextmenu', { clientX: 100, clientY: 100 })
      await body.getByRole('menuitem', { name: 'Export SVG…', exact: true }).click()
      console.log('Native export:', (await download).suggestedFilename)
      await session.detach()
    }
    await viewer.getByRole('button', { name: 'Close viewer' }).press('Enter')
    const source = await body.locator('.flair-native-diagram').first().getAttribute('data-vscode-context')
    await writeFile(request, source)
    await expect.poll(async () => JSON.parse(await readFile(response, 'utf8'))).toMatchObject({ line: 6, text: expect.stringContaining('A[') })
    console.log(host + ': native Markdown preview, 9 diagrams / 1 diagnostic, multi-selection, no selection boxes, viewer and source navigation passed.')
    if (host === 'cursor') {
      for (const entry of await readdir(resolve(profile, 'logs'), { recursive: true, withFileTypes: true })) {
        if (entry.name !== 'exthost.log') continue
        const log = await readFile(resolve(entry.parentPath, entry.name), 'utf8')
        const activated = disabledExtensions.filter(id => log.includes('_doActivateExtension ' + id + ','))
        if (activated.length) throw new Error('Unexpected activation of disabled extensions: ' + activated.join(', '))
      }
      console.log('Cursor: bundled agent extensions disabled and activation logs checked. Keyboard validation only if onboarding obscures the workspace.')
    }
  } finally {
    const session = await browser.newBrowserCDPSession().catch(() => undefined)
    await Promise.race([session?.send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))])
    await browser.close().catch(() => {})
  }
} finally { child.kill() }
