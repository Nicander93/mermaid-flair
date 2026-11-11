# Mermaid Flair

Open your usual Markdown preview. Mermaid diagrams automatically use Flair while headings, prose and other code blocks stay in the same document. This includes the standard VS Code preview and Cursor's same-tab Preview. Reload the window after installing or updating.

The diagram has two small controls: **Expand diagram** and **Copy image**, visible on hover or keyboard focus. The popup has only zoom in, zoom out, reset and close controls. Pan by dragging, zoom with the wheel, and press Escape to close. There are no persistent titles, export toolbars or selection panels in the popup.

**Copy image** copies the complete diagram as PNG at up to 2× resolution (4096-pixel longest edge limit), retaining its theme and color mode. Current zoom, selection highlights and UI controls are excluded. Right-click for Save image, Export SVG and other advanced actions.

Choose among three curated themes in extension Settings or **Mermaid Flair: Choose Default Theme**:

- **Whiteboard**: coordinated pastel categories with hand-drawn outlines; the default.
- **Clean**: restrained blue, teal and lavender with clean outlines.
- **Paper**: warm paper and muted natural colors.

Themes follow the host's color mode and code font. Retired theme settings map to the retained presets. No per-node color editing is required: explicit flowchart subgraphs share a color family, clear tree branches inherit a color, and shared/cyclic graphs use stable node identities. Author-specified colors take priority. Sequence participants and chart series use the theme's palette.

Dark mode keeps pastel node fills with dark node text, while titles, edge labels, sequence messages and legends remain light on the dark canvas. Default flowchart connections and sequence messages use brighter neutral lines and arrows at 2px; explicit inline widths take priority.

Click nodes, connections or participants to select; Ctrl/Cmd/Shift-click adds or removes a selection. Highlighting affects only the actual geometry and the selected line's own arrow. There are no selection rectangles. Ctrl/Cmd+C copies selected labels, or the whole image when nothing is selected.

**Mermaid Flair: Open Diagram Preview** remains an optional standalone pane. Native previews render the original fenced source passed by the extension, avoiding text injected into decorated code DOM. Errors are concise with expandable details. Rendering is offline with bundled Mermaid; external resources, HTML labels and active links are restricted.
