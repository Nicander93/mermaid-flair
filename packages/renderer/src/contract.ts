import type { ColorMode, Theme } from '../../themes/src/index'

export interface RenderRequest {
  source: string
  theme: Theme
  colorMode: ColorMode
  fontFamily?: string
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  background: string
}

export type RenderDiagram = (request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>
export const maxSourceLength = 50_000

export type RenderResponse =
  | { id: number; result: RenderResult }
  | { id: number; error: string }
