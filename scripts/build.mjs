import { build } from 'esbuild'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const obsidian = 'dist/obsidian/mermaid-flair'
const vscode = 'dist/vscode'
const common = {
  bundle: true,
  minify: true,
  metafile: true,
  legalComments: 'inline',
  target: 'chrome130',
}
const [frame, preview, native, extension] = await Promise.all([
  build({ ...common, entryPoints: ['packages/renderer/src/frame.ts'], format: 'iife', write: false }),
  build({ ...common, entryPoints: ['apps/vscode/src/preview.ts'], format: 'iife', outfile: `${vscode}/dist/preview.js` }),
  build({ ...common, entryPoints: ['apps/vscode/src/native-preview.ts'], format: 'iife', outfile: `${vscode}/dist/native-preview.js` }),
  build({
    ...common,
    entryPoints: ['apps/vscode/src/extension.ts'],
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    outfile: `${vscode}/dist/extension.js`,
  }),
])
const obsidianPlugin = await build({
  ...common,
  entryPoints: ['apps/obsidian/src/main.ts'],
  format: 'cjs',
  external: ['obsidian'],
  define: { FLAIR_RENDER_FRAME: JSON.stringify(frame.outputFiles[0].text) },
  outfile: `${obsidian}/main.js`,
})

const viewerCss = await readFile('packages/viewer/src/styles.css', 'utf8')
await Promise.all([
  cp('manifest.json', `${obsidian}/manifest.json`),
  cp('apps/vscode/package.json', `${vscode}/package.json`),
  cp('apps/vscode/README.md', `${vscode}/README.md`),
  cp('CHANGELOG.md', `${vscode}/CHANGELOG.md`),
  cp('LICENSE', `${vscode}/LICENSE`),
  cp('LICENSE', `${obsidian}/LICENSE`),
  writeFile(`${obsidian}/styles.css`, viewerCss),
  writeFile(`${vscode}/dist/native-preview.css`, viewerCss),
  readFile('apps/vscode/src/styles.css', 'utf8')
    .then(css => writeFile(`${vscode}/dist/styles.css`, viewerCss + '\n' + css)),
  writeNotices(`${obsidian}/THIRD_PARTY_NOTICES.txt`, [frame, obsidianPlugin]),
  writeNotices(`${vscode}/THIRD_PARTY_NOTICES.txt`, [preview, native, extension]),
])
await mkdir('dist/test', { recursive: true })
await writeFile('dist/test/renderer-frame.js', frame.outputFiles[0].text)
console.log('Built Obsidian and VS Code/Cursor packages in dist/.')

async function writeNotices(filename, builds) {
  const packages = new Map()
  for (const { metafile } of builds) {
    for (const input of Object.keys(metafile.inputs)) {
      const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//g
      const last = [...input.matchAll(match)].pop()
      if (!last) continue
      const directory = resolve(input.slice(0, last.index + last[0].length))
      if (packages.has(directory)) continue
      const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
      const files = (await readdir(directory)).filter(name => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name))
      if (!files.length && !metadata.license) throw new Error(`Missing license metadata for ${metadata.name}`)
      const notices = await Promise.all(files.map(name => readFile(resolve(directory, name), 'utf8')))
      packages.set(directory, `${metadata.name}@${metadata.version} — ${metadata.license ?? 'see below'}\n${notices.join('\n\n')}`)
    }
  }
  await mkdir(dirname(filename), { recursive: true })
  await writeFile(filename, 'Bundled third-party software\n\n' + [...packages.values()].sort().join('\n\n---\n\n')
    + '\n')
}
