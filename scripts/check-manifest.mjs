import { readFile } from 'node:fs/promises'
import { themes, themeLabels, themeDescriptions } from '../packages/themes/src/index.ts'

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'))
if (manifest.id !== 'mermaid-flair' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error('Invalid Obsidian manifest ID or version.')
}
if (process.argv[2] && process.argv[2] !== manifest.version) {
  throw new Error(`Obsidian release tag must equal ${manifest.version}.`)
}
const vscode = JSON.parse(await readFile('apps/vscode/package.json', 'utf8'))
for (const [field, expected] of [
  ['markdown.markdownItPlugins', true],
  ['markdown.previewScripts', ['./dist/native-preview.js']],
  ['markdown.previewStyles', ['./dist/native-preview.css']],
]) {
  if (JSON.stringify(vscode.contributes[field]) !== JSON.stringify(expected)) {
    throw new Error('Native Markdown preview contribution is missing: ' + field)
  }
}
for (const file of ['dist/native-preview.js', 'dist/native-preview.css']) {
  if (!vscode.files.includes(file)) throw new Error('Native Markdown preview asset is missing from the package: ' + file)
}
const setting = vscode.contributes.configuration.properties['mermaidFlair.theme']
for (const [field, expected] of [
  ['enum', themes],
  ['enumItemLabels', themes.map(theme => themeLabels[theme])],
  ['enumDescriptions', themes.map(theme => themeDescriptions[theme])],
]) {
  if (JSON.stringify(setting[field]) !== JSON.stringify(expected)) {
    throw new Error('VS Code theme configuration is out of sync: ' + field)
  }
}
