import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import MarkdownIt from 'markdown-it'
import { menu } from './preview-fixture'

const require = createRequire(import.meta.url)
const source = 'flowchart LR\n  A[Draft] --> B[Review]\n'
const markdown = '# Test\n\n```mermaid\n' + source + '```\n'

function loadBundle(path: string, external: string, api: object): Record<string, unknown> {
  const module = { exports: {} }
  runInNewContext(readFileSync(path, 'utf8'), {
    module, exports: module.exports,
    require: (name: string) => name === external ? api : require(name),
    setTimeout, clearTimeout, queueMicrotask, console, Buffer, URL, URLSearchParams,
  })
  return module.exports
}

interface VSCodeHostOptions {
  activeSource?: boolean
  tab?: 'custom' | 'text' | 'diff' | 'webview'
  candidates?: number
  pickIndex?: number | null
  commandResource?: boolean
}

async function createVSCodeHost(options: VSCodeHostOptions = {}) {
  let text = markdown
  const commands = new Map<string, (resource?: object) => void | Promise<void>>()
  const panels: string[] = []
  let pickerCount = 0
  const selections: { start: { line: number }; end: { line: number } }[] = []
  const notices: string[] = []
  let receive: (message: unknown) => void = () => {}
  let uriHandler: { handleUri: (uri: { path: string; query: string }) => Promise<void> } | undefined
  const disposable = { dispose() {} }
  class Uri {
    constructor(private readonly value: string) {}
    toString() { return this.value }
    static joinPath() { return uri }
  }
  class TabInputText { constructor(readonly uri: Uri) {} }
  class TabInputCustom { constructor(readonly uri: Uri) {} }
  class TabInputTextDiff { constructor(readonly modified: Uri) {} }
  const uri = new Uri('file:///test.md')
  const document = {
    uri, languageId: 'markdown', fileName: 'test.md', isUntitled: false, isClosed: false,
    getText: () => text,
    lineAt: (line: number) => ({ text: text.split('\n')[line] }),
  }
  const other = { ...document, uri: new Uri('file:///other.md'), fileName: 'other.md' }
  const documents = [document, other]
  const input = options.tab === 'custom' ? new TabInputCustom(uri)
    : options.tab === 'diff' ? new TabInputTextDiff(uri)
      : options.tab === 'webview' ? { viewType: 'markdown.preview' } : new TabInputText(uri)
  class Range {
    start: { line: number; character: number }
    end: { line: number; character: number }
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
      this.start = { line: startLine, character: startCharacter }
      this.end = { line: endLine, character: endCharacter }
    }
  }
  const api = {
    env: { uriScheme: 'vscode' },
    Range, Uri, TabInputText, TabInputCustom, TabInputTextDiff, ViewColumn: { Beside: 2 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 1 }, ColorThemeKind: { Dark: 2, HighContrast: 3 },
    commands: { registerCommand: (id: string, callback: (resource?: object) => void | Promise<void>) => { commands.set(id, callback); return disposable } },
    window: {
      registerUriHandler: (handler: NonNullable<typeof uriHandler>) => { uriHandler = handler; return disposable },
      activeTextEditor: options.activeSource === false ? undefined : { document, viewColumn: 1 },
      visibleTextEditors: options.activeSource === false ? [] : [{ document, viewColumn: 1 }],
      tabGroups: { activeTabGroup: { activeTab: { input }, viewColumn: 1 } },
      activeColorTheme: { kind: 2 },
      showQuickPick: async (items: unknown[]) => {
        pickerCount++
        return options.pickIndex === null ? undefined : items[options.pickIndex ?? 0]
      },
      createWebviewPanel: (_type: string, title: string) => {
        panels.push(title)
        return {
        webview: {
          cspSource: 'test', asWebviewUri: () => 'test', html: '', postMessage: async () => true,
          onDidReceiveMessage: (callback: typeof receive) => { receive = callback; return disposable },
        },
        onDidDispose: () => disposable, dispose() {},
        }
      },
      onDidChangeActiveColorTheme: () => disposable,
      showInformationMessage: (message: string) => { notices.push(message) },
      showErrorMessage: (message: string) => { notices.push(message) },
      showTextDocument: async (current: object, options: { selection: Range; viewColumn: number }) => {
        expect(current).toBe(document)
        expect([1, 2]).toContain(options.viewColumn)
        selections.push(options.selection)
        return { revealRange: (selection: Range) => { expect(selection).toBe(options.selection) } }
      },
    },
    workspace: {
      textDocuments: documents.slice(0, options.candidates ?? 1),
      asRelativePath: (value: Uri) => value.toString(),
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      onDidChangeTextDocument: () => disposable, onDidChangeConfiguration: () => disposable,
      openTextDocument: async (requested: Uri) => {
        const found = documents.find(document => document.uri.toString() === requested.toString())
        if (!found) throw new Error('Document not found')
        return found
      },
    },
  }
  const extension = loadBundle('dist/vscode/dist/extension.js', 'vscode', api)
  const activate = extension.activate as (context: object) => { extendMarkdownIt: (markdown: InstanceType<typeof MarkdownIt>) => InstanceType<typeof MarkdownIt> }
  const native = activate({ extensionUri: uri, subscriptions: [] })
  await commands.get('mermaidFlair.openPreview')?.(options.commandResource ? uri : undefined)
  return {
    receive: (message: unknown) => receive(message), selections, notices, panels, getPickerCount: () => pickerCount,
    setText: (value: string) => { text = value }, getText: () => text,
    renderMarkdown: (text: string, installFenceRendererFirst = false) => {
      const md = new MarkdownIt()
      if (installFenceRendererFirst) md.renderer.rules.fence = () => '<div class="other-mermaid">Other renderer</div>'
      native.extendMarkdownIt(md)
      if (!installFenceRendererFirst) md.renderer.rules.fence = () => '<div class="other-mermaid">Other renderer</div>'
      return md.render(text, { currentDocument: uri })
    },
    revealNative: (query: string) => uriHandler?.handleUri({ path: '/source', query }),
  }
}

test('contributes native Mermaid rendering without changing text, headings or other fences', async () => {
  const host = await createVSCodeHost()
  for (const first of [false, true]) {
    const html = host.renderMarkdown(markdown + '\n```typescript\nconst a = 1\n```', first)
    expect(html).toContain('<h1>Test</h1>')
    expect(html.match(/class="flair-native-diagram code-line"/g)).toHaveLength(1)
    expect(html).toContain('data-line="2"')
    expect(html).toContain('flowchart LR')
    expect(html.match(/other-mermaid/g)).toHaveLength(1)
    expect(html).not.toContain('acquireVsCodeApi')
  }
})

test('native source links use opaque tokens and recheck current source before navigation', async () => {
  const host = await createVSCodeHost()
  const html = host.renderMarkdown(markdown)
  const encoded = /data-flair-options="([^"]+)"/.exec(html)?.[1]
  if (!encoded) throw new Error('Missing native options')
  const options = JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as { token: string; sourceLink: string }
  expect(options.sourceLink).toContain('vscode://mermaid-flair.mermaid-flair/source?token=')
  host.setText('Inserted\n' + markdown)
  await host.revealNative(new URLSearchParams({ token: 'untrusted', target: '{"identifier":"B"}' }).toString())
  expect(host.selections).toEqual([])
  await host.revealNative(new URLSearchParams({ token: options.token, target: '{"identifier":"B"}' }).toString())
  expect(host.selections[0]).toMatchObject({ start: { line: 5 } })
  expect(host.getText()).toBe('Inserted\n' + markdown)
})

test('renders and selects in a normal Markdown document, follows its mode and downloads clean SVG', async ({ page }, testInfo) => {
  page.on('pageerror', error => console.log('Native preview error:', error.message))
  const host = await createVSCodeHost()
  const html = host.renderMarkdown(markdown + '\nText after the diagram.\n')
  await page.route('http://native.test/script.js', route => route.fulfill({ path: 'dist/vscode/dist/native-preview.js' }))
  await page.route('http://native.test/style.css', route => route.fulfill({ path: 'dist/vscode/dist/native-preview.css' }))
  await page.route('http://native.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; script-src 'nonce-native'; style-src 'self' 'unsafe-inline'">
    <link rel="stylesheet" href="/style.css"><body class="vscode-light"><main>${html}</main>
    <script nonce="native">document.querySelector('.flair-native-diagram code').prepend('shell 外壳与布局\\n');</script>
    <script nonce="native" src="/script.js"></script>` }))
  await page.goto('http://native.test/')
  await expect(page.getByRole('heading', { name: 'Test' })).toBeVisible()
  await expect(page.getByText('Text after the diagram.', { exact: true })).toBeVisible()
  const figure = page.locator('.flair-diagram')
  await expect(figure.locator('.flair-inline-surface svg')).toBeVisible()
  await figure.getByRole('button', { name: 'node · Draft', exact: true }).click()
  await expect(figure.getByLabel('Selected element count')).toHaveText('1 selected')
  await expect(figure.locator('[data-flair-selection-overlay]')).toHaveCount(0)
  await expect(figure.locator('[data-flair-highlight="selected"]')).not.toHaveCount(0)
  await figure.getByRole('button', { name: 'node · Draft', exact: true }).press('Escape')
  const connection = figure.getByRole('button', { name: 'connection · Draft → Review', exact: true }).first()
  const point = await connection.evaluate(element => {
    const path = element.matches('path') ? element as SVGPathElement : element.querySelector<SVGPathElement>('path:not([data-flair-hit-area])')
    if (!path) throw new Error('Missing edge path')
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM() ?? new DOMMatrix())
    return { x: point.x, y: point.y }
  })
  await page.mouse.click(point.x, point.y)
  await expect(figure.getByLabel('Selected element count')).toHaveText('1 selected')
  await page.evaluate(() => { document.body.className = 'vscode-dark' })
  await expect(figure).toHaveAttribute('data-mode', 'dark')
  await expect(figure).not.toHaveAttribute('aria-busy', 'true')
  await expect(figure.getByLabel('Selected element count')).toHaveText('1 selected')
  await figure.focus()
  await figure.getByRole('button', { name: 'Expand diagram', exact: true }).click()
  const viewer = page.getByRole('dialog')
  await expect(viewer.getByLabel('Selected element text', { exact: true })).toHaveText('Draft → Review')
  const download = page.waitForEvent('download')
  await menu(page, viewer, 'Export SVG…')
  const file = await download
  expect(file.suggestedFilename()).toBe('mermaid-line-3.svg')
  const path = await file.path()
  if (!path) throw new Error('Download missing')
  expect(readFileSync(path, 'utf8')).not.toMatch(/data-flair-highlight|data-flair-hit-area|aria-pressed/)
  await page.screenshot({ path: testInfo.outputPath('native-preview.png') })
  await viewer.getByRole('button', { name: 'Close viewer', exact: true }).click()
  const next = host.renderMarkdown(markdown.replace('Draft', 'Updated'))
  await page.evaluate(value => { const main = document.querySelector('main'); if (main) main.innerHTML = value }, next)
  await expect(page.locator('.flair-diagram')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'node · Updated', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => {
    const forged = document.createElement('div')
    forged.id = 'forged'
    forged.className = 'flair-native-diagram'
    forged.dataset.flairOptions = JSON.stringify({ line: 1, token: 'a'.repeat(36), sourceLink: 'https://external.test/leak', preferences: { theme: 'invalid' } })
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = 'flowchart LR\n X[Untrusted] --> Y[Content]'
    pre.append(code)
    forged.append(pre)
    document.body.append(forged)
  })
  const forged = page.locator('#forged')
  await forged.getByRole('button', { name: 'node · Untrusted', exact: true }).click()
  await forged.locator('.flair-diagram').dispatchEvent('contextmenu', { clientX: 100, clientY: 100 })
  await expect(page.getByRole('menuitem', { name: 'Show source', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(forged.locator('.flair-diagram')).toHaveAttribute('data-theme', 'sketch')
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.nonce = 'native'
    script.src = '/script.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Duplicate script load failed'))
    document.body.append(script)
  }))
  await expect(page.locator('.flair-diagram')).toHaveCount(2)
  await expect(forged.getByLabel('Selected element count')).toHaveText('1 selected')
})

test('VS Code bundle resolves current document positions and only selects existing source text', async () => {
  const host = await createVSCodeHost()
  const current = 'Inserted paragraph\n' + markdown
  host.setText(current)
  host.receive({ type: 'revealSource', source, blockLine: 3, target: { identifier: 'B' } })
  await expect.poll(() => host.selections.length).toBe(1)
  expect(host.selections[0]).toMatchObject({ start: { line: 5 }, end: { line: 5 } })
  expect(host.getText()).toBe(current)
  expect(host.notices).toEqual([])
})

test('VS Code bundle rejects invalid navigation messages and reports changed diagrams', async () => {
  const host = await createVSCodeHost()
  host.receive({ type: 'revealSource', source, blockLine: -1 })
  host.receive({ type: 'revealSource', source: 'x'.repeat(50_001), blockLine: 3 })
  host.setText(markdown.replace('Draft', 'Changed'))
  host.receive({ type: 'revealSource', source, blockLine: 3, target: { identifier: 'A' } })
  await expect.poll(() => host.notices.length).toBe(1)
  expect(host.notices[0]).toContain('diagram has changed')
  expect(host.selections).toEqual([])
})

interface Position { line: number; ch: number }

test('opens Flair from a Markdown custom preview without an active text editor', async () => {
  const host = await createVSCodeHost({ activeSource: false, tab: 'custom', candidates: 2 })
  expect(host.panels).toEqual(['Mermaid Flair · test.md'])
  expect(host.getPickerCount()).toBe(0)
  expect(host.notices).toEqual([])
})

test('opens the only Markdown source when a native preview has no public source URI', async () => {
  const host = await createVSCodeHost({ activeSource: false, tab: 'webview' })
  expect(host.panels).toEqual(['Mermaid Flair · test.md'])
  expect(host.notices).toEqual([])
})

test('lets the user choose among multiple Markdown documents from a native preview', async () => {
  const host = await createVSCodeHost({ activeSource: false, tab: 'webview', candidates: 2, pickIndex: 1 })
  expect(host.panels).toEqual(['Mermaid Flair · other.md'])
  expect(host.getPickerCount()).toBe(1)
  const cancelled = await createVSCodeHost({ activeSource: false, tab: 'webview', candidates: 2, pickIndex: null })
  expect(cancelled.panels).toEqual([])
  expect(cancelled.notices).toEqual([])
})

test('honors the editor title resource and the modified document of a diff tab', async () => {
  const title = await createVSCodeHost({ activeSource: false, tab: 'webview', candidates: 0, commandResource: true })
  expect(title.panels).toEqual(['Mermaid Flair · test.md'])
  const diff = await createVSCodeHost({ activeSource: false, tab: 'diff', candidates: 0 })
  expect(diff.panels).toEqual(['Mermaid Flair · test.md'])
})

test('gives a source-mode instruction when no Markdown document can be identified', async () => {
  const host = await createVSCodeHost({ activeSource: false, tab: 'webview', candidates: 0 })
  expect(host.panels).toEqual([])
  expect(host.notices).toEqual(['Switch this tab to Markdown source, then run Mermaid Flair: Open Diagram Preview.'])
})

function createObsidianHost(hasSourceView: boolean) {
  let text = markdown
  let reads = 0
  const selections: { from: Position; to: Position }[] = []
  const opened: object[] = []
  const revealed: object[] = []
  const notices: string[] = []
  class TFile {}
  const file = new TFile()
  class MarkdownView {
    file = file
    editor = {
      getValue: () => text,
      getLine: (line: number) => text.split('\n')[line],
      setSelection: (from: Position, to: Position) => { selections.push({ from, to }) },
      scrollIntoView: (_range: object, center: boolean) => { expect(center).toBe(true) },
      focus() {},
    }
    getMode() { return hasSourceView ? 'source' : 'preview' }
  }
  class Notice { constructor(message: string) { notices.push(message) } }
  class Plugin { app: object = {} }
  const view = new MarkdownView()
  const leaf = { view, openFile: async (openedFile: object, options: object) => {
    expect(openedFile).toBe(file)
    opened.push(options)
  } }
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => { expect(path).toBe('test.md'); return file },
      cachedRead: async () => { reads++; return markdown },
    },
    workspace: {
      getLeavesOfType: () => [leaf], getLeaf: () => leaf,
      revealLeaf: async (value: object) => { revealed.push(value) },
    },
  }
  const bundle = loadBundle('dist/obsidian/mermaid-flair/main.js', 'obsidian', {
    TFile, MarkdownView, Plugin, Notice, PluginSettingTab: class {}, MarkdownRenderChild: class {},
  })
  const MermaidFlair = bundle.default as new () => {
    app: object
    revealSource: (path: string, source: string, hint: number, target?: object) => Promise<void>
  }
  const plugin = new MermaidFlair()
  plugin.app = app
  return { plugin, opened, revealed, selections, notices, getReads: () => reads,
    setText: (value: string) => { text = value }, getText: () => text }
}

test('Obsidian bundle uses unsaved editor text and reuses the source view without editing it', async () => {
  const host = createObsidianHost(true)
  const current = 'Unsaved paragraph\n' + markdown
  host.setText(current)
  await host.plugin.revealSource('test.md', source, 3, { identifier: 'B' })
  expect(host.getReads()).toBe(0)
  expect(host.opened).toEqual([])
  expect(host.revealed).toHaveLength(1)
  expect(host.selections).toEqual([{ from: { line: 5, ch: 0 }, to: { line: 5, ch: 24 } }])
  expect(host.getText()).toBe(current)
})

test('Obsidian bundle falls back to the diagram start and refuses stale previews', async () => {
  const host = createObsidianHost(false)
  await host.plugin.revealSource('test.md', source, 3, { text: 'Not found' })
  expect(host.getReads()).toBe(1)
  expect(host.opened).toEqual([{ state: { mode: 'source' } }])
  expect(host.selections[0].from).toEqual({ line: 3, ch: 0 })
  const changed = createObsidianHost(true)
  changed.setText(markdown.replace('Draft', 'Changed'))
  await changed.plugin.revealSource('test.md', source, 3, { identifier: 'A' })
  expect(changed.opened).toEqual([])
  expect(changed.selections).toEqual([])
  expect(changed.notices[0]).toContain('diagram has changed')
})
