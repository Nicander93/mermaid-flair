import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { checkClipboardImage } from './clipboard-image.mjs'

const [host, executable, mode] = process.argv.slice(2)
if (host !== 'obsidian') throw new Error('Use native-smoke.mjs for VS Code/Cursor; it disables Cursor agent extensions.')
const mvp = mode === '--mvp'
const disabled = mode === '--disabled' && host === 'obsidian'
if (!executable || !['obsidian', 'vscode', 'cursor'].includes(host)) {
  throw new Error('Usage: node scripts/spike.mjs obsidian|vscode|cursor <executable> [--mvp|--disabled]')
}

const root = resolve('.local', mvp || disabled ? 'mvp' : 'spike', host)
const profile = resolve(root, 'profile')
const extensions = resolve(root, 'extensions')
const demo = resolve(root, 'demo')
await mkdir(demo, { recursive: true })
const note = resolve(demo, 'multi-diagram.md')
await cp('fixtures/mermaid/multi-diagram.md', note)

let args
if (host === 'obsidian') {
  const config = resolve(demo, '.obsidian')
  const plugin = resolve(config, 'plugins/mermaid-flair-spike')
  await mkdir(plugin, { recursive: true })
  await mkdir(profile, { recursive: true })
  await writeFile(resolve(profile, 'obsidian.json'), JSON.stringify({
    vaults: { spike: { path: demo, ts: Date.now(), open: true } },
  }))
  await writeFile(resolve(config, 'community-plugins.json'), JSON.stringify(mvp
    ? ['mermaid-flair', 'mermaid-flair-spike']
    : ['mermaid-flair-spike']))
  if (mvp) {
    await cp('dist/obsidian/mermaid-flair', resolve(config, 'plugins/mermaid-flair'), { recursive: true })
    await writeFile(resolve(config, 'plugins/mermaid-flair/data.json'), JSON.stringify({
      theme: 'sketch', followHost: true, hoverToolbar: true,
    }))
  }
  await writeFile(resolve(config, 'app.json'), '{"defaultViewMode":"preview"}')
  await writeFile(resolve(profile, 'spike.json'), '{}')
  await writeFile(resolve(plugin, 'manifest.json'), JSON.stringify({
    id: 'mermaid-flair-spike', name: 'Mermaid Flair Spike', version: '0.0.1',
    minAppVersion: '1.8.0', description: 'Tests code block processor precedence.',
    author: 'Mermaid Flair', isDesktopOnly: true,
  }))
  await writeFile(resolve(plugin, 'main.js'), `
    const { Plugin, apiVersion } = require('obsidian')
    module.exports = class extends Plugin {
      onload() {
        window.flairSpikeVersion = apiVersion
        if (!${mvp || disabled}) this.registerMarkdownCodeBlockProcessor('mermaid', (source, el) => {
          const output = el.createEl('p', { cls: 'flair-spike', text: 'Flair processor: ' + source.trim().split('\\n')[0] })
          output.dataset.length = String(source.length)
        }, -100)
        this.app.workspace.onLayoutReady(() => {
          const file = this.app.vault.getAbstractFileByPath('multi-diagram.md')
          if (!file) return
          const leaf = this.app.workspace.getLeaf(false)
          void leaf.openFile(file, { state: { mode: 'preview' } })
          window.flairSpikeEdit = () => leaf.setViewState({
            type: 'markdown', state: { file: file.path, mode: 'source', source: false }
          })
          window.flairSpikeRead = () => leaf.setViewState({
            type: 'markdown', state: { file: file.path, mode: 'preview' }
          })
          window.flairSpikeSelection = () => ({ mode: leaf.view.getMode(), text: leaf.view.editor.getSelection() })
          window.flairSpikeTheme = () => {
            document.body.classList.remove('theme-light')
            document.body.classList.add('theme-dark')
            this.app.workspace.trigger('css-change')
          }
        })
      }
    }
  `)
  args = ['--user-data-dir=' + profile]
} else {
  await mkdir(resolve(profile, 'User'), { recursive: true })
  await writeFile(resolve(profile, 'User/settings.json'), JSON.stringify({
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    'chat.disableAIFeatures': true,
    'extensions.autoUpdate': false,
    'workbench.startupEditor': 'none',
    'files.hotExit': 'off',
  }))
  const plugin = resolve(extensions, 'mermaid-flair-spike')
  await mkdir(plugin, { recursive: true })
  await writeFile(resolve(plugin, 'package.json'), JSON.stringify({
    publisher: 'mermaid-flair', name: 'spike', version: '0.0.1', engines: { vscode: '^1.96.0' },
    activationEvents: ['onLanguage:markdown'], main: './main.cjs',
    ...(mvp ? { extensionDependencies: ['mermaid-flair.mermaid-flair'] } : {}),
  }))
  await writeFile(resolve(plugin, 'main.cjs'), mvp ? `
    const vscode = require('vscode')
    exports.activate = context => {
      const fs = require('node:fs')
      context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
        fs.writeFileSync(${JSON.stringify(resolve(root, 'selection.json'))}, JSON.stringify({
          line: event.selections[0].start.line,
          text: event.textEditor.document.getText(event.selections[0]),
        }))
      }))
      if (${host === 'vscode'}) context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('mermaidFlair.theme') && vscode.workspace.getConfiguration('mermaidFlair').get('theme') === 'nord') {
          void vscode.commands.executeCommand('workbench.action.toggleLightDarkThemes')
        }
      }))
      function openPreview(editor) {
        if (editor?.document.languageId === 'markdown') {
          void vscode.commands.executeCommand('mermaidFlair.openPreview')
          return true
        }
        return false
      }
      if (!openPreview(vscode.window.activeTextEditor)) {
        const subscription = vscode.window.onDidChangeActiveTextEditor(editor => {
          if (openPreview(editor)) subscription.dispose()
        })
        context.subscriptions.push(subscription)
      }
    }
  ` : `
    const vscode = require('vscode')
    exports.activate = async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const panel = vscode.window.createWebviewPanel('mermaidFlairSpike', 'Flair spike', vscode.ViewColumn.Beside)
      const count = editor.document.getText().split('\\n').filter(line => line === '\`\`\`mermaid').length
      panel.webview.html = '<!DOCTYPE html><title>Flair spike</title><p id="flair-spike">Mermaid blocks: ' + count + '</p>'
    }
  `)
  args = ['--user-data-dir', profile, '--extensions-dir', extensions, '--skip-welcome', '--disable-workspace-trust', note]
  if (mvp) args.push('--extensionDevelopmentPath=' + resolve(extensions, 'mermaid-flair-spike'))
}

const processEnv = { ...process.env, APPDATA: root, LOCALAPPDATA: root, USERPROFILE: root, HOME: root }
const child = spawn(executable, ['--remote-debugging-port=0', ...args], {
  env: processEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
})
let launchLog = ''
child.stderr.on('data', chunk => { launchLog = (launchLog + chunk.toString()).slice(-4000) })
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(() => reject(new Error('Host did not expose its test debug endpoint.')), 15_000)
    const finish = (error, url) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolveEndpoint(url)
    }
    child.once('error', error => finish(error))
    child.once('exit', code => finish(new Error('Host exited: ' + code + '\n' + launchLog)))
    child.stderr.on('data', chunk => {
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(chunk.toString())
      if (match) finish(null, match[1])
    })
  })
  const browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 15_000 })
  if (host === 'obsidian') {
    const trustDemo = page.getByRole('button', { name: /trust.*enable|信任仓库作者并启用插件/i })
    const result = disabled ? '.markdown-preview-view .mermaid svg' : mvp ? '.flair-diagram .flair-inline-surface svg' : '.flair-spike'
    await page.locator(`${result}, .mermaid svg`).or(trustDemo).first().waitFor({ timeout: 15_000 })
    if (await trustDemo.isVisible()) {
      await trustDemo.click()
      const close = page.locator('.modal.mod-settings .modal-close-button')
      await close.waitFor({ timeout: 10_000 })
      await close.click()
    }
    try {
      await page.locator(result).first().waitFor({ timeout: 20_000 })
    } catch (error) {
      console.log((await page.locator('body').innerText()).slice(0, 2500))
      throw error
    }
    const runtime = { apiVersion: await page.evaluate(() => window.flairSpikeVersion) }
    await writeFile(resolve(root, 'runtime.json'), JSON.stringify(runtime, null, 2))
    console.log('Obsidian API version:', runtime.apiVersion)
    const native = await page.locator('.mermaid svg').count()
    if (disabled) {
      assert.ok(native > 0)
      assert.equal(await page.locator('.flair-diagram').count(), 0)
      await page.screenshot({ path: resolve(root, 'disabled.png') })
      console.log('Restarted with Flair disabled:', native, 'native results, no custom results.')
    } else {
      assert.equal(native, 0)
      console.log('Reading view:', await page.locator(result).count(), 'custom results,', native, 'native results')
      await page.screenshot({ path: resolve(root, 'reading-view.png') })
      if (mvp) {
        const first = page.locator('.flair-diagram').first()
        await first.focus()
        await first.getByRole('button', { name: 'Copy image', exact: true }).click()
        await expect(first.locator('.flair-status')).toHaveText('Done.')
        await checkClipboardImage()
        await page.evaluate(() => window.flairSpikeTheme())
        await page.locator('.flair-diagram[data-theme="sketch"][data-mode="dark"]:not([aria-busy]) .flair-inline-surface svg').first().waitFor()
        await checkViewer(page, first)
        await page.screenshot({ path: resolve(root, 'viewer.png') })
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: /Mermaid diagram/ }).waitFor({ state: 'detached' })
        await first.locator('.flair-inline-surface').getByRole('button', { name: /^node ·/ }).first().click()
        await expect(first.getByLabel('Selected element count')).toHaveText('1 selected')
        await page.screenshot({ path: resolve(root, 'inline-selection.png') })
        await first.dispatchEvent('contextmenu', { clientX: 100, clientY: 100 })
        await page.getByRole('menuitem', { name: 'Show source', exact: true }).click()
        await expect.poll(() => page.evaluate(() => window.flairSpikeSelection())).toMatchObject({
          mode: 'source', text: expect.stringContaining('A['),
        })
        console.log('Reading View: direct node selection and source editor navigation verified.')
      }
      await page.evaluate(() => window.flairSpikeEdit())
      await page.locator('.markdown-source-view').waitFor({ timeout: 10_000 })
      await page.waitForFunction(() => document.querySelector('.markdown-source-view .flair-spike, .markdown-source-view .mermaid svg'))
      console.log('Live preview:', await page.locator('.markdown-source-view .flair-spike, .markdown-source-view .flair-diagram').count(),
        'custom results,', await page.locator('.markdown-source-view .mermaid svg').count(), 'native results')
      await page.screenshot({ path: resolve(root, 'live-preview.png') })
      if (mvp && process.argv.includes('--settings')) {
        const gear = page.locator('.clickable-icon').filter({ has: page.locator('svg.lucide-settings') }).filter({ visible: true }).last()
        await gear.click({ timeout: 5_000 })
        let settingsPage
        try {
          await expect.poll(async () => {
            for (const candidate of context.pages()) {
              if (await candidate.getByText('Mermaid Flair', { exact: true }).count()) {
                settingsPage = candidate
                return true
              }
            }
            return false
          }).toBe(true)
        } catch (error) {
          console.log(await Promise.all(context.pages().map(async candidate => ({
            url: candidate.url(), text: (await candidate.locator('body').innerText()).slice(-700),
          }))))
          throw error
        }
        await settingsPage.getByText('Mermaid Flair', { exact: true }).first().click()
        const row = settingsPage.locator('.setting-item').filter({ hasText: 'Default diagram style' })
        const dropdown = row.locator('select:not([aria-hidden="true"])')
        assert.equal(await dropdown.locator('option').count(), 3)
        const next = await dropdown.inputValue() === 'sketch-paper' ? 'modern' : 'sketch-paper'
        await dropdown.selectOption(next)
        await expect.poll(async () => {
          try { return JSON.parse(await readFile(resolve(demo, '.obsidian/plugins/mermaid-flair/data.json'), 'utf8')).theme }
          catch { return undefined }
        }).toBe(next)
        await settingsPage.screenshot({ path: resolve(root, 'settings.png') })
        await page.evaluate(() => window.flairSpikeRead())
        await page.locator(`.flair-diagram[data-theme="${next}"]:not([aria-busy]) .flair-inline-surface svg`).first().waitFor({ timeout: 10_000 })
        await settingsPage.getByText(/^(Appearance|外观)$/).first().click()
        const schemes = settingsPage.locator('select:not([aria-hidden="true"])')
        const scheme = await schemes.evaluateAll(selects => selects.map((select, index) => ({
          index,
          light: [...select.options].find(option => /浅色|明亮|Light/i.test(option.text))?.value,
          dark: [...select.options].find(option => /深色|暗色|Dark/i.test(option.text))?.value,
        })).find(value => value.light && value.dark))
        assert.ok(scheme, 'Appearance should offer light and dark schemes.')
        for (const mode of ['dark', 'light', 'dark']) {
          await schemes.nth(scheme.index).selectOption(scheme[mode])
          try {
            await page.locator(`.flair-diagram[data-mode="${mode}"]`).first().waitFor({ state: 'attached', timeout: 10_000 })
          } catch (error) {
            console.log('Host theme state:', await page.evaluate(() => ({
              body: document.body.className,
              diagrams: [...document.querySelectorAll('.flair-diagram')].map(element => element.getAttribute('data-mode')),
            })))
            throw error
          }
        }
        console.log('Obsidian: diagrams followed real Appearance changes between light and dark.')
        if (settingsPage !== page) await settingsPage.close()
        else await settingsPage.locator('.modal-close-button').first().click()
        await page.bringToFront()
        await page.evaluate(() => window.flairSpikeRead())
        try {
          await page.locator(`.flair-diagram[data-theme="${next}"][data-mode="dark"]:not([aria-busy]) .flair-inline-surface svg`).first().waitFor({ timeout: 25_000 })
          await expect(page.locator('.flair-diagram').first().locator('.flair-error')).toHaveCount(0)
        } catch (error) {
          console.log('Final diagram state:', await page.locator('.flair-diagram').evaluateAll(figures => figures.map(figure => ({
            theme: figure.getAttribute('data-theme'), mode: figure.getAttribute('data-mode'), busy: figure.getAttribute('aria-busy'),
            status: figure.querySelector('.flair-status')?.textContent, svg: figure.querySelector('.flair-inline-surface')?.shadowRoot?.querySelector('svg')?.id,
          }))))
          throw error
        }
        console.log('Obsidian: three curated themes verified, default theme saved and applied to Reading View.')
        await page.screenshot({ path: resolve(root, 'appearance-dark.png') })
      }
    }
  } else {
    const body = page.frameLocator('iframe.webview').frameLocator('iframe#active-frame')
    if (mvp) {
      const figures = body.locator('.flair-diagram')
      await figures.locator('.flair-inline-surface svg').nth(8).waitFor({ timeout: 15_000 })
      assert.equal(await figures.count(), 10)
      assert.equal(await figures.locator('.flair-error').count(), 1)
      console.log('Dedicated preview: 9 diagrams, 1 diagnostic.')
      const first = figures.first()
      await first.focus()
      await first.getByLabel('Diagram style').selectOption('sketch')
      await body.locator('.flair-diagram[data-theme="sketch"]:not([aria-busy]) .flair-inline-surface svg').first().waitFor({ timeout: 10_000 })
      if (host === 'vscode') {
        const mode = await first.getAttribute('data-mode')
        await body.getByRole('button', { name: 'Default theme…' }).click()
        await page.locator('.quick-input-widget').getByText('Nord', { exact: true }).click({ timeout: 10_000 })
        await body.locator(`.flair-diagram[data-theme="sketch"][data-mode="${mode === 'dark' ? 'light' : 'dark'}"]:not([aria-busy]) .flair-inline-surface svg`).first()
          .waitFor({ timeout: 10_000 })
        const settings = JSON.parse(await readFile(resolve(profile, 'User/settings.json'), 'utf8'))
        assert.equal(settings['mermaidFlair.theme'], 'nord')
        console.log('Default theme saved to settings; diagrams followed the real host light/dark change.')
      }
      await page.screenshot({ path: resolve(root, 'independent-preview.png') })
      await checkViewer(body, first, host === 'cursor')
      if (host === 'cursor' && await page.getByText('Log In', { exact: true }).first().isVisible()) {
        const png = await body.locator('.flair-svg-surface svg').evaluate(async svg => {
          const image = document.createElement('img')
          const markup = new XMLSerializer().serializeToString(svg)
          const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
          image.src = url
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          canvas.getContext('2d').drawImage(image, 0, 0)
          const png = canvas.toDataURL().split(',')[1]
          URL.revokeObjectURL(url)
          return png
        })
        await writeFile(resolve(root, 'webview-diagram.png'), Buffer.from(png, 'base64'))
        console.log('Cursor onboarding covers the workbench. Verified the webview with keyboard input.')
      } else await page.screenshot({ path: resolve(root, 'viewer.png') })
      await body.getByRole('button', { name: 'Close viewer', exact: true }).press('Enter')
      const node = first.locator('.flair-inline-surface').getByRole('button', { name: /^node ·/ }).first()
      if (host === 'cursor') await node.press('Enter')
      else await node.click()
      await expect(first.getByLabel('Selected element count')).toHaveText('1 selected')
      await page.screenshot({ path: resolve(root, 'inline-selection.png') })
      const reveal = first.getByRole('button', { name: 'Show source', exact: true })
      if (host === 'cursor') await reveal.press('Enter')
      else await reveal.click()
      await expect.poll(async () => JSON.parse(await readFile(resolve(root, 'selection.json'), 'utf8')))
        .toMatchObject({ line: 6, text: expect.stringContaining('A[') })
      console.log('Dedicated preview: direct node selection and source editor navigation verified.')
    } else console.log(await body.locator('#flair-spike').textContent())
    await page.screenshot({ path: resolve(root, 'independent-preview.png') })
  }
  await browser.close()
} finally {
  child.kill()
}

async function checkViewer(surface, figure, keyboard = false) {
  await figure.press('Enter')
  const viewer = surface.getByRole('dialog', { name: /Mermaid diagram/ })
  await viewer.waitFor({ timeout: 10_000 })
  const reset = viewer.getByRole('button', { name: 'Reset view' })
  const zoom = viewer.getByRole('button', { name: 'Zoom in' })
  const initial = Number.parseFloat(await viewer.getByLabel('Zoom level').textContent())
  if (keyboard) {
    await reset.press('Enter')
    await zoom.press('Enter')
  } else {
    await reset.click()
    await zoom.click()
  }
  assert.ok(Number.parseFloat(await viewer.getByLabel('Zoom level').textContent()) > initial)
  const width = await viewer.locator('.flair-svg-surface svg').evaluate(svg => svg.viewBox.baseVal.width)
  assert.ok(width > 0)
  const fit = viewer.getByRole('button', { name: 'Reset view' })
  if (keyboard) await fit.press('Enter')
  else await fit.click()
  await viewer.locator('.flair-svg-surface').getByRole('button', { name: /^node ·/ }).first().press('Enter')
  assert.equal(await viewer.getByLabel('Selected element count').textContent(), '1 selected')
  assert.equal(await viewer.locator('button').count(), 4)
  console.log('Viewer: simple four-control popup, zoom and selection verified.')
}
