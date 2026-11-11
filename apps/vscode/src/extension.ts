import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import { defaults, normalizeTheme, themes, themeLabels, themeDescriptions } from '../../../packages/themes/src/index'
import { getDiagramBlocks } from './markdown'
import type { PreviewState } from './messages'
import { locateDiagramSource, parseSourceTarget } from '../../../packages/source/src/locate'
import { createNativePreview } from './native'

export function activate(context: vscode.ExtensionContext) {
  const native = createNativePreview(context)
  const panels = new Map<string, vscode.WebviewPanel>()
  context.subscriptions.push(vscode.commands.registerCommand('mermaidFlair.chooseTheme', chooseDefaultTheme))
  context.subscriptions.push(vscode.commands.registerCommand('mermaidFlair.openPreview', async (resource?: vscode.Uri) => {
    const document = await getMarkdownDocument(resource)
    if (!document) return
    const documentUri = document.uri
    const sourceColumn = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === documentUri.toString())?.viewColumn
      ?? vscode.window.tabGroups.activeTabGroup.viewColumn
    const key = documentUri.toString()
    const existing = panels.get(key)
    if (existing) {
      existing.reveal()
      return
    }
    const resourceRoot = vscode.Uri.joinPath(context.extensionUri, 'dist')
    const name = document.isUntitled ? 'Untitled' : document.fileName.split(/[\\/]/).pop() ?? 'Markdown'
    const panel = vscode.window.createWebviewPanel('mermaidFlair.preview', `Mermaid Flair · ${name}`, vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [resourceRoot],
    })
    panels.set(key, panel)
    const { webview } = panel
    let ready = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let diagrams = getDiagramBlocks(document.getText())

    function postState() {
      if (!ready) return
      const config = vscode.workspace.getConfiguration('mermaidFlair')
      const theme = config.get('theme')
      const mode = vscode.window.activeColorTheme.kind
      const state: PreviewState = {
        name,
        diagrams,
        preferences: {
          theme: normalizeTheme(theme) ?? defaults.theme,
          followHost: config.get('followHost', defaults.followHost),
          hoverToolbar: config.get('hoverToolbar', defaults.hoverToolbar),
        },
        colorMode: [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(mode) ? 'dark' : 'light',
        fontFamily: vscode.workspace.getConfiguration('editor', documentUri).get<string>('fontFamily'),
      }
      void webview.postMessage(state)
    }

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() !== key || !event.contentChanges.length) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          diagrams = getDiagramBlocks(event.document.getText())
          postState()
        }, 150)
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('mermaidFlair') || event.affectsConfiguration('editor.fontFamily', documentUri)) postState()
      }),
      vscode.window.onDidChangeActiveColorTheme(postState),
      webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message)) return
        if (message.type === 'ready') {
          ready = true
          postState()
        }
        if (message.type === 'chooseTheme') void chooseDefaultTheme()
        if (message.type === 'revealSource' && 'source' in message && typeof message.source === 'string'
          && message.source.length <= 50_000 && 'blockLine' in message && typeof message.blockLine === 'number'
          && Number.isSafeInteger(message.blockLine) && message.blockLine > 0) {
          const source = message.source
          const hint = message.blockLine
          const target = 'target' in message ? parseSourceTarget(message.target) : undefined
          void (async () => {
            try {
              const current = await vscode.workspace.openTextDocument(documentUri)
              const position = locateDiagramSource(current.getText(), source, hint, target)
              if (!position) {
                void vscode.window.showInformationMessage('This diagram has changed. Select an element in the refreshed preview.')
                return
              }
              const selection = new vscode.Range(position.line, 0, position.line, current.lineAt(position.line).text.length)
              const editor = await vscode.window.showTextDocument(current, { viewColumn: sourceColumn, selection })
              editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
            } catch (error) {
              void vscode.window.showErrorMessage('Could not open diagram source. ' + String(error))
            }
          })()
        }
        if (message.type === 'copy' && 'text' in message && typeof message.text === 'string' && message.text.length <= 100_000) {
          void vscode.env.clipboard.writeText(message.text).then(undefined, (error: unknown) => {
            void vscode.window.showErrorMessage('Could not copy selected text. ' + String(error))
          })
        }
        if (message.type === 'export' && 'svg' in message && typeof message.svg === 'string'
          && message.svg.startsWith('<svg ') && message.svg.length <= 10_000_000
          && 'filename' in message && typeof message.filename === 'string'
          && /^mermaid-line-\d+\.svg$/.test(message.filename)) {
          void saveDiagram(Buffer.from(message.svg, 'utf8'), message.filename, 'svg')
        }
        if (message.type === 'exportPng' && 'base64' in message && typeof message.base64 === 'string'
          && message.base64.startsWith('iVBORw0KGgo') && message.base64.length <= 28_000_000
          && 'filename' in message && typeof message.filename === 'string'
          && /^mermaid-line-\d+\.png$/.test(message.filename)) {
          void saveDiagram(Buffer.from(message.base64, 'base64'), message.filename, 'png')
        }
      }),
    ]
    panel.onDidDispose(() => {
      panels.delete(key)
      clearTimeout(timer)
      for (const subscription of subscriptions) subscription.dispose()
    })
    webview.html = previewHtml(webview, resourceRoot)
  }), { dispose: () => { for (const panel of panels.values()) panel.dispose() } })
  return native
}

async function getMarkdownDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    if (resource instanceof vscode.Uri) {
      const document = await vscode.workspace.openTextDocument(resource)
      if (document.languageId === 'markdown') return document
    }
    const active = vscode.window.activeTextEditor?.document
    if (active?.languageId === 'markdown') return active
    const input: unknown = vscode.window.tabGroups.activeTabGroup.activeTab?.input
    const uri = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom ? input.uri
      : input instanceof vscode.TabInputTextDiff ? input.modified : undefined
    if (uri) {
      const document = await vscode.workspace.openTextDocument(uri)
      if (document.languageId === 'markdown') return document
    }
    const documents = vscode.workspace.textDocuments.filter(document => !document.isClosed && document.languageId === 'markdown')
    if (documents.length === 1) return documents[0]
    if (documents.length > 1) {
      const picked = await vscode.window.showQuickPick(documents.map(document => ({
        label: document.isUntitled ? 'Untitled' : document.fileName.split(/[\\/]/).pop() ?? 'Markdown',
        description: vscode.workspace.asRelativePath(document.uri),
        document,
      })), {
        title: 'Mermaid Flair · Choose Markdown document',
        placeHolder: 'Choose the source document for the Flair diagram preview',
        matchOnDescription: true,
      })
      return picked?.document
    }
    void vscode.window.showInformationMessage('Switch this tab to Markdown source, then run Mermaid Flair: Open Diagram Preview.')
  } catch (error) {
    void vscode.window.showErrorMessage('Could not open the Mermaid Flair preview. ' + String(error))
  }
}

async function chooseDefaultTheme() {
  const config = vscode.workspace.getConfiguration('mermaidFlair')
  const current = normalizeTheme(config.get('theme')) ?? defaults.theme
  const picked = await vscode.window.showQuickPick(themes.map(theme => ({
    label: themeLabels[theme],
    description: theme === current ? 'Current default' : undefined,
    detail: themeDescriptions[theme],
    theme,
  })), {
    title: 'Mermaid Flair · Default theme',
    placeHolder: 'Choose a default theme for your diagrams',
    matchOnDetail: true,
  })
  if (!picked) return
  try {
    await config.update('theme', picked.theme, vscode.ConfigurationTarget.Global)
  } catch (error) {
    void vscode.window.showErrorMessage('Could not save the default diagram theme. ' + String(error))
  }
}

function previewHtml(webview: vscode.Webview, resourceRoot: vscode.Uri) {
  const nonce = randomBytes(18).toString('base64')
  const script = webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'preview.js'))
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'styles.css'))
  const csp = `default-src 'none'; img-src blob: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; base-uri 'none'; form-action 'none'`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${styles}">
  <title>Mermaid Flair</title>
</head>
<body>
  <main id="flair-preview" class="flair-preview"></main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`
}

async function saveDiagram(data: Uint8Array, filename: string, format: 'svg' | 'png') {
  try {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(filename),
      filters: { [format.toUpperCase() + ' image']: [format] },
    })
    if (uri) await vscode.workspace.fs.writeFile(uri, data)
  } catch (error) {
    void vscode.window.showErrorMessage('Could not export the Mermaid diagram. ' + String(error))
  }
}
