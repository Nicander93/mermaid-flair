# Changelog

## 0.5.2

- Keep each theme's pastel node fills in dark mode, with dark node text and separate light text for canvas labels, sequence messages and legends.
- Brighten dark flowchart connections and sequence messages, including their arrows, and increase default line width to 2px while respecting explicit inline widths.
- Match sequence participant colors between header and footer copies; keep unboxed actor labels readable on the canvas.
- Cover dark text roles, authored styles and connections, clean image copying, and state/class/ER/Gantt/mindmap/pie samples in regression checks.
- Cancel obsolete queued renders across the iframe boundary when appearance changes, so rapid switching finishes with the latest SVG; prevent copying stale images while refreshing.

## 0.5.1

- Refine all dark palettes with clearer fills, softer text and neutral connections; tint automatic node outlines to match their fills.
- Preserve hand-drawn segment endpoints and use a single lighter stroke with round caps to remove corner gaps and doubled spikes.
- Add the reported application overview fixture and a geometry regression for connected node contours.

## 0.5.0

- Curate three themes: Whiteboard, Clean and Paper, with matched light/dark categorical palettes and retired-setting migration.
- Automatically color flowchart groups and unambiguous tree branches using Mermaid's parsed structure; preserve author colors and stable node identities.
- Use only expand and copy-image icons in previews; replace the viewer with a clean popup and four floating controls.
- Copy the entire clean diagram as PNG, independently of selection and viewport zoom; move advanced actions into a context menu.
- Remove visible selection panels and per-diagram theme dropdowns.
- Pass canonical source to native previews, covering decorated-DOM text contamination, and collapse verbose errors into expandable diagnostics.

## 0.4.0

- Render Mermaid automatically inside the standard VS Code and Cursor Markdown previews, including Cursor's same-tab Preview editor.
- Preserve the surrounding Markdown and avoid duplicate Mermaid rendering through a dedicated token renderer.
- Replace rectangular selection boxes with direct node, line and arrow highlighting; restore the original colors on deselection.
- Give unlabelled flowchart connections meaningful endpoint labels.
- Replace the viewer's persistent selection textarea with a compact action bar shown only while elements are selected.
- Add native preview lifecycle, source capability and exact-highlight regression coverage, plus isolated host smoke scripts.

## 0.3.2

- Open the Flair preview from Markdown custom preview tabs even when no text editor is active.
- Honor the file supplied by editor toolbar commands and resolve the source from text and diff tabs.
- Offer a document picker when a native preview has no public source URI and multiple Markdown documents are open.
- Add a visible graph button to Markdown editor toolbars and five preview-entry regression tests.

## 0.3.1

- Reuse an existing Obsidian source editor when navigating, preserving unsaved content without reopening the file.
- Add four API contract tests against the built host plugins for current source positions, unsaved buffers, stale previews and invalid messages.

## 0.3.0

- Select elements directly in the regular preview, with multi-selection, keyboard support and copying labels.
- Keep selection in sync when opening and closing the expanded viewer.
- Add Show source in VS Code/Cursor and Obsidian, highlighting the corresponding Markdown line.
- Resolve source locations against the current document and fall back to the diagram start when the element is ambiguous.

## 0.2.0

- Add Sketch Paper, Sketch Mint, Nord, Rose and Violet presets, each with light and dark palettes.
- Add a default-theme picker for VS Code/Cursor and palette previews in Obsidian settings.
- Select flowchart nodes and connections and sequence participants, messages and notes in the expanded viewer.
- Add Ctrl/Cmd multi-selection, keyboard selection and copying selected labels.
- Preserve selection and zoom when the host switches between light and dark mode.
- Scope interactive SVG styles in a Shadow DOM and keep selection decorations separate from exports.

## 0.1.2

- Follow the host editor’s code font, including live changes to VS Code/Cursor editor.fontFamily.
- Use a system monospace font stack for standalone rendering and SVG export.

## 0.1.1

- Refine Sketch with a whiteboard palette, solid pastel fills and controlled Rough.js outlines.
- Bundle Excalifont under SIL OFL 1.1 and embed it in exported SVGs.
- Improve label wrapping, node padding and sequence typography.
- Preserve safe CSS child selectors when sanitizing SVG styles.

## 0.1.0

- Add automatic Mermaid styling in Obsidian Reading View and a dedicated Markdown diagram preview for VS Code and Cursor.
- Add Minimal, Modern and Sketch styles, light and dark palettes, and temporary per-diagram style selection.
- Add an expanded viewer with zoom, pan, fit, reset, standalone SVG and 2× PNG export.
- Show Mermaid diagnostics inline and continue rendering the other blocks in the note.
