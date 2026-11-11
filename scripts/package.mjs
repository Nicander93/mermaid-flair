import { createVSIX } from '@vscode/vsce'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'

const cwd = resolve('dist/vscode')
const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'))
const obsidian = resolve('dist/obsidian/mermaid-flair')
const obsidianManifest = JSON.parse(await readFile(resolve(obsidian, 'manifest.json'), 'utf8'))
if (manifest.version !== obsidianManifest.version) throw new Error('Plugin versions must match for a combined release.')
await createVSIX({
  cwd,
  packagePath: resolve(`dist/mermaid-flair-${manifest.version}.vsix`),
  dependencies: false,
  allowMissingRepository: true,
  allowStarActivation: false,
})
const zipName = `mermaid-flair-obsidian-${manifest.version}.zip`
const zip = new yazl.ZipFile()
const files = ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'main.js', 'manifest.json', 'styles.css']
for (const file of files) zip.addFile(resolve(obsidian, file), `mermaid-flair/${file}`)
const writing = pipeline(zip.outputStream, createWriteStream(resolve('dist', zipName)))
zip.end()
await writing
const artifacts = [
  [`mermaid-flair-${manifest.version}.vsix`, resolve(`dist/mermaid-flair-${manifest.version}.vsix`)],
  [zipName, resolve('dist', zipName)],
  ...files.map(file => [file, resolve(obsidian, file)]),
]
const checksums = await Promise.all(artifacts.map(async ([name, path]) => `${createHash('sha256').update(await readFile(path)).digest('hex')}  ${name}`))
await writeFile('dist/SHA256SUMS.txt', checksums.join('\n') + '\n')
console.log(`Packaged ${zipName} and SHA256SUMS.txt`)
