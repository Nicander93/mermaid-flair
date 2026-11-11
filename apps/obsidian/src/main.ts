import { MarkdownRenderChild, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'
import { createIsolatedRenderer } from '../../../packages/renderer/src/isolated'
import { defaults, getPalette, isTheme, normalizeTheme, themeDescriptions, themeLabels, themes } from '../../../packages/themes/src/index'
import type { Preferences, Theme } from '../../../packages/themes/src/index'
import { downloadFile, mountDiagram } from '../../../packages/viewer/src/index'
import { locateDiagramSource } from '../../../packages/source/src/locate'
import type { SourceTarget } from '../../../packages/source/src/locate'

declare const FLAIR_RENDER_FRAME: string

export default class MermaidFlair extends Plugin {
  preferences = { ...defaults }
  private diagrams = new Set<{ update: () => void; dispose: () => void }>()
  private renderers = new Map<Document, ReturnType<typeof createIsolatedRenderer>>()
  private saving = Promise.resolve()

  async onload() {
    const saved: unknown = await this.loadData()
    if (saved && typeof saved === 'object') {
      if ('theme' in saved) this.preferences.theme = normalizeTheme(saved.theme) ?? defaults.theme
      if ('followHost' in saved && typeof saved.followHost === 'boolean') this.preferences.followHost = saved.followHost
      if ('hoverToolbar' in saved && typeof saved.hoverToolbar === 'boolean') this.preferences.hoverToolbar = saved.hoverToolbar
    }
    this.registerMarkdownCodeBlockProcessor('mermaid', (source, element, context) => {
      const document = element.ownerDocument
      const child = new MarkdownRenderChild(element)
      const renderer = this.getRenderer(document)
      const mode = () => document.body.classList.contains('theme-dark') ? 'dark' : 'light'
      const codeFont = () => document.defaultView?.getComputedStyle(document.body).getPropertyValue('--font-monospace').trim()
      const line = context.getSectionInfo(element)?.lineStart
      const diagram = mountDiagram(element, source, {
        render: renderer.render,
        preferences: this.preferences,
        colorMode: mode(),
        fontFamily: codeFont(),
        title: line === undefined ? 'Mermaid diagram' : `Mermaid diagram · line ${line + 1}`,
        filename: line === undefined ? 'mermaid-diagram.svg' : `mermaid-line-${line + 1}.svg`,
        save: (file, filename) => downloadFile(document, file, filename),
        copyText: text => document.defaultView?.navigator.clipboard.writeText(text),
        revealSource: target => this.revealSource(context.sourcePath, source, line === undefined ? undefined : line + 1, target),
      })
      const mounted = {
        update: () => diagram.update(this.preferences, mode(), codeFont()),
        dispose: diagram.dispose,
      }
      this.diagrams.add(mounted)
      child.register(() => {
        this.diagrams.delete(mounted)
        diagram.dispose()
      })
      context.addChild(child)
    }, -100)
    this.registerEvent(this.app.workspace.on('css-change', () => this.updateDiagrams()))
    this.addSettingTab(new FlairSettings(this))
    this.app.workspace.onLayoutReady(() => this.refreshReadingViews())
  }

  onunload() {
    for (const diagram of this.diagrams) diagram.dispose()
    this.diagrams.clear()
    for (const renderer of this.renderers.values()) renderer.dispose()
    this.renderers.clear()
    queueMicrotask(() => this.refreshReadingViews())
  }

  async setPreferences(patch: Partial<Preferences>) {
    this.preferences = { ...this.preferences, ...patch }
    const snapshot = this.preferences
    this.updateDiagrams()
    this.saving = this.saving.catch(() => {}).then(() => this.saveData(snapshot))
    try {
      await this.saving
    } catch {
      new Notice('Mermaid Flair could not save these settings. Please try again.')
    }
  }

  private getRenderer(document: Document) {
    const existing = this.renderers.get(document)
    if (existing) return existing
    const renderer = createIsolatedRenderer(document, FLAIR_RENDER_FRAME)
    const dispose = () => {
      document.defaultView?.removeEventListener('pagehide', dispose)
      renderer.dispose()
      this.renderers.delete(document)
    }
    const mounted = { render: renderer.render, dispose }
    this.renderers.set(document, mounted)
    document.defaultView?.addEventListener('pagehide', dispose, { once: true })
    return mounted
  }

  private updateDiagrams() {
    for (const diagram of this.diagrams) diagram.update()
  }

  private async revealSource(path: string, source: string, hint: number | undefined, target?: SourceTarget) {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) throw new Error('The Markdown file is no longer available.')
    const leaves = this.app.workspace.getLeavesOfType('markdown').filter(leaf => leaf.view instanceof MarkdownView && leaf.view.file === file)
    const existing = leaves.find(leaf => leaf.view instanceof MarkdownView && leaf.view.getMode() === 'source') ?? leaves[0]
    const markdown = existing?.view instanceof MarkdownView && existing.view.getMode() === 'source'
      ? existing.view.editor.getValue() : await this.app.vault.cachedRead(file)
    const position = locateDiagramSource(markdown, source, hint, target)
    if (!position) {
      new Notice('This diagram has changed. Select an element in the refreshed preview.')
      return
    }
    const leaf = existing ?? this.app.workspace.getLeaf(false)
    if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== 'source') {
      await leaf.openFile(file, { state: { mode: 'source' } })
    }
    await this.app.workspace.revealLeaf(leaf)
    if (!(leaf.view instanceof MarkdownView)) return
    const from = { line: position.line, ch: 0 }
    const to = { line: position.line, ch: leaf.view.editor.getLine(position.line).length }
    leaf.view.editor.setSelection(from, to)
    leaf.view.editor.scrollIntoView({ from, to }, true)
    leaf.view.editor.focus()
  }

  private refreshReadingViews() {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') leaf.view.previewMode.rerender(true)
    }
  }
}

class FlairSettings extends PluginSettingTab {
  constructor(private readonly plugin: MermaidFlair) {
    super(plugin.app, plugin)
  }

  display() {
    this.containerEl.empty()
    const themeSetting = new Setting(this.containerEl)
      .setName('Default diagram style')
      .setDesc('Choose a preset. Each preset has light and dark palettes.')
    const preview = this.containerEl.createDiv({ cls: 'flair-theme-preview' })
    function showPreview(theme: Theme) {
      preview.empty()
      preview.createDiv({ text: themeDescriptions[theme] })
      for (const mode of ['light', 'dark'] as const) {
        const palette = getPalette(theme, mode)
        const colors = preview.createDiv({ cls: 'flair-theme-swatches' })
        colors.setAttribute('aria-label', `${mode} palette`)
        colors.createSpan({ text: mode === 'light' ? 'Light' : 'Dark' })
        for (const color of [palette.background, ...palette.colors]) {
          const swatch = colors.createSpan({ cls: 'flair-theme-swatch' })
          swatch.style.backgroundColor = color
          swatch.setAttribute('title', color)
        }
      }
    }
    showPreview(this.plugin.preferences.theme)
    themeSetting.addDropdown(control => {
      for (const theme of themes) control.addOption(theme, themeLabels[theme])
      control.setValue(this.plugin.preferences.theme).onChange(async value => {
        if (isTheme(value)) {
          showPreview(value)
          await this.plugin.setPreferences({ theme: value })
        }
      })
    })
    new Setting(this.containerEl)
      .setName('Follow Obsidian’s color mode')
      .setDesc('When off, diagrams use the light palette.')
      .addToggle(control => control.setValue(this.plugin.preferences.followHost)
        .onChange(followHost => this.plugin.setPreferences({ followHost })))
    new Setting(this.containerEl)
      .setName('Show diagram tools on hover or focus')
      .setDesc('Press Enter on a focused diagram to open the viewer.')
      .addToggle(control => control.setValue(this.plugin.preferences.hoverToolbar)
        .onChange(hoverToolbar => this.plugin.setPreferences({ hoverToolbar })))
  }
}
