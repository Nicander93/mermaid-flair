import type { ColorMode, Preferences } from '../../../packages/themes/src/index'
import type { DiagramBlock } from './markdown'
import type { SourceTarget } from '../../../packages/source/src/locate'

export interface PreviewState {
  name: string
  diagrams: DiagramBlock[]
  preferences: Preferences
  colorMode: ColorMode
  fontFamily?: string
}

export type PreviewMessage =
  | { type: 'ready' }
  | { type: 'export'; svg: string; filename: string }
  | { type: 'exportPng'; base64: string; filename: string }
  | { type: 'copy'; text: string }
  | { type: 'chooseTheme' }
  | { type: 'revealSource'; source: string; blockLine: number; target?: SourceTarget }
