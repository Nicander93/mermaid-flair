import { expect, test } from '@playwright/test'
import { getPalette, isTheme, isSketchTheme, normalizeTheme, themes } from '../packages/themes/src/index'

test('offers three curated themes and migrates retired theme IDs', () => {
  expect(themes).toEqual(['sketch', 'modern', 'sketch-paper'])
  expect(normalizeTheme('minimal')).toBe('modern')
  expect(normalizeTheme('nord')).toBe('modern')
  expect(normalizeTheme('sketch-mint')).toBe('sketch')
  expect(normalizeTheme('rose')).toBe('sketch-paper')
  expect(isTheme('unknown')).toBe(false)
  expect(themes.filter(isSketchTheme)).toHaveLength(2)
})

test('keeps normal text readable across every light and dark palette', () => {
  for (const theme of themes) {
    for (const mode of ['light', 'dark'] as const) {
      const palette = getPalette(theme, mode)
      for (const [text, background] of [[palette.text, palette.background], ...palette.colors.map(fill => [palette.nodeText, fill])]) {
        const pair = [luminance(text), luminance(background)].sort((a, b) => b - a)
        expect((pair[0] + 0.05) / (pair[1] + 0.05), `${theme} ${mode} ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})

function luminance(color: string) {
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
