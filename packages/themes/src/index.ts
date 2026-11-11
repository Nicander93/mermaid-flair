export const themes = ['sketch', 'modern', 'sketch-paper'] as const
export type Theme = typeof themes[number]
export type ColorMode = 'light' | 'dark'

export const themeLabels: Record<Theme, string> = { sketch: 'Whiteboard', modern: 'Clean', 'sketch-paper': 'Paper' }
export const themeDescriptions: Record<Theme, string> = {
  sketch: 'Soft categorical colors with hand-drawn outlines',
  modern: 'Quiet blue, teal and lavender with clean outlines',
  'sketch-paper': 'Warm paper with muted earth and botanical colors',
}

export function isTheme(value: unknown): value is Theme {
  return themes.some(theme => theme === value)
}

export function normalizeTheme(value: unknown): Theme | undefined {
  if (isTheme(value)) return value
  if (typeof value !== 'string') return
  if (value === 'sketch-mint') return 'sketch'
  if (value === 'rose') return 'sketch-paper'
  if (['minimal', 'nord', 'violet'].includes(value)) return 'modern'
}

export function isSketchTheme(theme: Theme) { return theme !== 'modern' }
export const defaults = { theme: 'sketch' as Theme, followHost: true, hoverToolbar: true }
export type Preferences = typeof defaults

const fills: Record<Theme, string[]> = {
  sketch: ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9', '#d0bfff', '#ffd8a8'],
  modern: ['#e7f0ff', '#e3f3ef', '#ede8fa', '#fff0db', '#e4edf2', '#f5e7ef'],
  'sketch-paper': ['#d8e1e3', '#dae5d5', '#eee0bb', '#e7d4c8', '#ded8e5', '#e9e4d2'],
}

export function getPalette(theme: Theme, mode: ColorMode) {
  const dark = mode === 'dark'
  const paper = theme === 'sketch-paper'
  return {
    background: dark ? (paper ? '#24221e' : '#1b1d21') : paper ? '#fffaf0' : theme === 'modern' ? '#fafbfe' : '#fffefb',
    surface: fills[theme][0],
    border: dark ? '#b6c2cf' : paper ? '#6c6251' : '#495057',
    nodeBorder: paper ? '#6c6251' : '#495057',
    nodeText: dark ? '#26313a' : '#242930',
    accent: dark ? '#74c0fc' : '#1864ab',
    text: dark ? (paper ? '#ece6d9' : '#e2e7ed') : '#242930',
    note: fills[theme][2],
    colors: fills[theme],
  }
}

export function colorIndex(identity: string, count = 6) {
  let hash = 2166136261
  for (const character of identity) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619)
  return (hash >>> 0) % count
}
