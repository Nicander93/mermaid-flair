import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { getPalette, isSketchTheme } from '../../themes/src/index'
import type { Theme, ColorMode } from '../../themes/src/index'
import { maxSourceLength } from './contract'
import type { RenderRequest, RenderResult } from './contract'
import { defaultCodeFontFamily } from './fonts'
import { applySketch } from './sketch'
import { applyColors, readFlowColors } from './colors'
import type { FlowColors } from './colors'

let sequence = 0
let pending = Promise.resolve()

export function renderDiagram(request: RenderRequest, signal?: AbortSignal): Promise<RenderResult> {
  // Mermaid's configuration belongs to the document, so requests must run in order.
  const result = pending.then(() => {
    signal?.throwIfAborted()
    return render(request)
  })
  pending = result.then(() => {}, () => {})
  return result
}

async function render({ source, theme, colorMode, fontFamily: requestedFont }: RenderRequest): Promise<RenderResult> {
  if (source.length > maxSourceLength) throw new Error('This diagram exceeds 50,000 characters.')
  if (!source.trim()) throw new Error('The Mermaid block is empty.')

  const palette = getPalette(theme, colorMode)
  const sketch = isSketchTheme(theme)
  const fontStyle = document.createElement('span').style
  fontStyle.fontFamily = requestedFont ? `${requestedFont}, ${defaultCodeFontFamily}` : defaultCodeFontFamily
  const fontFamily = fontStyle.fontFamily || defaultCodeFontFamily
  const fontSize = sketch ? 20 : 18
  const seriesColors: Record<string, string> = {}
  for (let index = 0; index < 12; index++) {
    seriesColors[`cScale${index}`] = palette.colors[index % palette.colors.length]
    seriesColors[`cScaleLabel${index}`] = palette.nodeText
    seriesColors[`pie${index + 1}`] = palette.colors[index % palette.colors.length]
  }
  const container = document.body.appendChild(document.createElement('div'))
  container.className = 'flair-render-stage'
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: maxSourceLength,
      maxEdges: 500,
      secure: [
        'secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering', 'maxTextSize', 'maxEdges',
        'theme', 'themeCSS', 'themeVariables', 'look', 'htmlLabels', 'fontFamily',
      ],
      theme: 'base',
      look: 'classic',
      htmlLabels: false,
      fontFamily,
      flowchart: {
        wrappingWidth: 280,
        nodeSpacing: 40,
        rankSpacing: 44,
        padding: 18,
        diagramPadding: 24,
        subGraphTitleMargin: { top: 8, bottom: 16 },
      },
      sequence: {
        actorFontFamily: fontFamily,
        actorFontSize: fontSize,
        noteFontFamily: fontFamily,
        noteFontSize: fontSize,
        messageFontFamily: fontFamily,
        messageFontSize: fontSize,
      },
      themeVariables: {
        ...seriesColors,
        fontFamily,
        fontSize: `${fontSize}px`,
        darkMode: colorMode === 'dark',
        background: palette.background,
        primaryColor: palette.surface,
        primaryBorderColor: palette.nodeBorder,
        primaryTextColor: palette.nodeText,
        secondaryColor: colorMode === 'dark' ? palette.colors[1] : palette.background,
        secondaryBorderColor: palette.nodeBorder,
        secondaryTextColor: palette.nodeText,
        tertiaryColor: palette.surface,
        tertiaryBorderColor: palette.nodeBorder,
        tertiaryTextColor: palette.nodeText,
        textColor: palette.text,
        titleColor: palette.text,
        lineColor: palette.border,
        defaultLinkColor: palette.border,
        arrowheadColor: palette.border,
        edgeLabelBackground: palette.background,
        mainBkg: palette.surface,
        nodeBorder: palette.nodeBorder,
        nodeTextColor: palette.nodeText,
        clusterBkg: palette.background,
        clusterBorder: palette.border,
        actorBkg: palette.surface,
        actorBorder: palette.nodeBorder,
        actorTextColor: palette.nodeText,
        actorLineColor: palette.border,
        signalColor: palette.border,
        signalTextColor: palette.text,
        labelBoxBkgColor: palette.surface,
        labelBoxBorderColor: palette.nodeBorder,
        labelTextColor: palette.nodeText,
        loopTextColor: palette.text,
        noteBkgColor: palette.note,
        noteTextColor: palette.nodeText,
        noteBorderColor: sketch ? palette.nodeBorder : palette.accent,
        classText: palette.nodeText,
        stateLabelColor: palette.nodeText,
        transitionLabelColor: palette.text,
        taskTextColor: palette.nodeText,
        taskTextDarkColor: palette.nodeText,
        taskTextLightColor: palette.nodeText,
        taskTextOutsideColor: palette.text,
        pieSectionTextColor: palette.nodeText,
        pieLegendTextColor: palette.text,
        pieTitleTextColor: palette.text,
        pieStrokeColor: palette.nodeBorder,
        pieOuterStrokeColor: palette.nodeBorder,
        pieOpacity: colorMode === 'dark' ? '1' : '0.7',
      },
      themeCSS: (theme === 'modern'
        ? '.node rect.label-container, rect.actor, rect.note { rx: 8px; ry: 8px; }'
        : sketch
          ? `.node rect { rx: 10px; ry: 10px; }
             .node .label-container { stroke-width: 1.7px; }
             .cluster > rect { stroke-dasharray: 6 5; }
             .cluster-label text { font-size: 18px; }`
          : '') + (colorMode === 'dark' ? `
            .flowchart-link, .messageLine0, .messageLine1 { stroke-width: 2px; }
            .node text, .node .label text, .node text tspan { fill: ${palette.nodeText}; }
            .edgeLabel text, .edgeLabel .label text, .edgeLabel text tspan { fill: ${palette.text}; }
          ` : ''),
    })
    const model = readFlowColors(await mermaid.mermaidAPI.getDiagramFromText(source))
    const { svg } = await mermaid.render('flair-' + ++sequence, source, container)
    return prepareSvg(svg, palette.background, sketch, container, model, theme, colorMode)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error))
  } finally {
    container.remove()
  }
}

function prepareSvg(markup: string, background: string, sketch: boolean, container: HTMLElement, model: FlowColors | undefined, theme: Theme, mode: ColorMode): RenderResult {
  const fragment = DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'image', 'feImage', 'a', 'set', 'animate', 'animateMotion', 'animateTransform'],
    RETURN_DOM_FRAGMENT: true,
  })
  const svg = fragment.querySelector('svg')
  if (!svg) throw new Error('Mermaid did not produce an SVG.')
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error('Mermaid produced a diagram without usable dimensions.')
  }
  const [x, y, width, height] = viewBox
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const { name, value } of [...element.attributes]) {
      if ((name === 'href' || name === 'xlink:href') && !/^#[\w:.-]+$/.test(value)) element.removeAttribute(name)
      if (name === 'style' && !isLocalCss(value)) element.removeAttribute(name)
      if (/url\s*\(/i.test(value) && !isLocalCss(value)) element.removeAttribute(name)
    }
    if (element.localName === 'style' && !isLocalCss(element.textContent ?? '')) element.remove()
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', String(Math.ceil(width)))
  svg.setAttribute('height', String(Math.ceil(height)))
  svg.removeAttribute('style')
  const backdrop = document.createElementNS(svg.namespaceURI, 'rect')
  backdrop.setAttribute('x', String(x))
  backdrop.setAttribute('y', String(y))
  backdrop.setAttribute('width', String(width))
  backdrop.setAttribute('height', String(height))
  backdrop.setAttribute('fill', background)
  svg.prepend(backdrop)
  container.replaceChildren(svg)
  applyColors(svg, model, theme, mode)
  if (sketch) {
    container.replaceChildren(svg)
    applySketch(svg)
  }
  return { svg: new XMLSerializer().serializeToString(svg), width, height, background }
}

function isLocalCss(css: string) {
  const value = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Mermaid's markers and filters use fragment references. External CSS/resources are excluded.
  const localUrls = /url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi
  const rest = value.replace(localUrls, '').replace(/@(?:-webkit-)?keyframes\b/gi, '')
  return !/[\\@<]/.test(rest) && !/\b(?:url|src|[\w-]*image-set)\s*\(/i.test(rest)
}
