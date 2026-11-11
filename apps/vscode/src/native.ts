import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { defaults, normalizeTheme } from '../../../packages/themes/src/index'
import { locateDiagramSource, parseSourceTarget } from '../../../packages/source/src/locate'

interface NativeSource {
  uri: vscode.Uri
  source: string
  line: number
}

export function createNativePreview(context: vscode.ExtensionContext) {
  const sources = new Map<string, NativeSource>()
  async function reveal(token: unknown, value: unknown) {
    if (typeof token !== 'string') return
    const source = sources.get(token)
    if (!source) return
    try {
      const document = await vscode.workspace.openTextDocument(source.uri)
      const position = locateDiagramSource(document.getText(), source.source, source.line, parseSourceTarget(value))
      if (!position) {
        void vscode.window.showInformationMessage('This diagram has changed. Refresh the Markdown preview and select it again.')
        return
      }
      const selection = new vscode.Range(position.line, 0, position.line, document.lineAt(position.line).text.length)
      const editor = await vscode.window.showTextDocument(document, { selection, viewColumn: vscode.ViewColumn.Beside })
      editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    } catch (error) {
      void vscode.window.showErrorMessage('Could not open diagram source. ' + String(error))
    }
  }
  context.subscriptions.push(
    { dispose: () => sources.clear() },
    vscode.commands.registerCommand('mermaidFlair.revealNativeSource', (value: unknown) => {
      if (value && typeof value === 'object' && 'flairToken' in value) {
        return reveal(value.flairToken, 'flairTarget' in value ? value.flairTarget : undefined)
      }
    }),
    vscode.window.registerUriHandler({ handleUri: async uri => {
      if (uri.path !== '/source' || uri.query.length > 24_000) return
      const query = new URLSearchParams(uri.query)
      let target: unknown
      try { target = JSON.parse(query.get('target') ?? 'null') } catch { return }
      await reveal(query.get('token'), target)
    } }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('mermaidFlair') || event.affectsConfiguration('editor.fontFamily')) refresh()
    }),
  )
  function refresh() {
    void vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => {})
  }
  return {
    extendMarkdownIt(markdown: InstanceType<typeof MarkdownIt>) {
      markdown.core.ruler.after('block', 'mermaid_flair', state => {
        for (const token of state.tokens) {
          if (token.type === 'fence' && /^mermaid(?:\s|$)/i.test(token.info.trim())) token.type = 'flair_mermaid'
        }
      })
      markdown.renderer.rules.flair_mermaid = (tokens, index, _options, env) => {
        const block = tokens[index]
        const value: unknown = env && 'currentDocument' in env ? env.currentDocument : undefined
        const uri = value instanceof vscode.Uri ? value : undefined
        const config = vscode.workspace.getConfiguration('mermaidFlair', uri)
        const configured = config.get('theme')
        const line = (block.map?.[0] ?? 0) + 1
        const token = randomBytes(18).toString('hex')
        if (uri) {
          sources.set(token, { uri, source: block.content, line })
          while (sources.size > 512) sources.delete(sources.keys().next().value as string)
        }
        const options = {
          line,
          source: block.content,
          token: uri ? token : undefined,
          sourceLink: uri ? `${vscode.env.uriScheme}://mermaid-flair.mermaid-flair/source?token=${token}` : undefined,
          preferences: {
            theme: normalizeTheme(configured) ?? defaults.theme,
            followHost: config.get('followHost', defaults.followHost),
            hoverToolbar: config.get('hoverToolbar', defaults.hoverToolbar),
          },
          fontFamily: vscode.workspace.getConfiguration('editor', uri).get<string>('fontFamily'),
        }
        return `<div class="flair-native-diagram code-line" data-line="${line - 1}" data-flair-options="${markdown.utils.escapeHtml(JSON.stringify(options))}"><pre><code>${markdown.utils.escapeHtml(block.content)}</code></pre></div>\n`
      }
      return markdown
    },
  }
}
