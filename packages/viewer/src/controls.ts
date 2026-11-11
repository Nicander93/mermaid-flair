const paths = {
  expand: ['M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7'],
  copy: ['M9 9h12v12H9z', 'M5 15H3V3h12v2'],
  plus: ['M21 21l-5-5', 'M10 7v6M7 10h6'],
  minus: ['M21 21l-5-5', 'M7 10h6'],
  reset: ['M3 10a9 9 0 1 1 2 8', 'M3 4v6h6'],
  close: ['M6 6l12 12M6 18L18 6'],
}

export function iconButton(document: Document, icon: keyof typeof paths, label: string, action: () => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value)
  if (icon === 'plus' || icon === 'minus') {
    const circle = document.createElementNS(svg.namespaceURI, 'circle')
    circle.setAttribute('cx', '10')
    circle.setAttribute('cy', '10')
    circle.setAttribute('r', '7')
    svg.append(circle)
  }
  for (const d of paths[icon]) {
    const path = document.createElementNS(svg.namespaceURI, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  button.append(svg)
  button.addEventListener('click', action)
  return button
}

export interface MenuAction { label: string; run: () => void; disabled?: boolean }

export function contextMenu(host: HTMLElement, actions: () => MenuAction[]) {
  const document = host.ownerDocument
  let menu: HTMLElement | undefined
  function close() {
    menu?.remove()
    menu = undefined
    document.removeEventListener('pointerdown', outside, true)
  }
  function outside(event: Event) { if (!menu?.contains(event.target as Node)) close() }
  function open(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    close()
    menu = document.createElement('div')
    menu.className = 'flair-context-menu'
    menu.setAttribute('role', 'menu')
    for (const action of actions()) {
      const item = document.createElement('button')
      item.type = 'button'
      item.textContent = action.label
      item.setAttribute('role', 'menuitem')
      item.disabled = !!action.disabled
      item.addEventListener('click', () => { close(); action.run() })
      menu.append(item)
    }
    ;(host.closest('dialog') ?? document.body).append(menu)
    const x = event.clientX || host.getBoundingClientRect().left + 16
    const y = event.clientY || host.getBoundingClientRect().top + 16
    menu.style.left = `${Math.max(8, Math.min(x, document.documentElement.clientWidth - menu.offsetWidth - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(y, document.documentElement.clientHeight - menu.offsetHeight - 8))}px`
    menu.addEventListener('keydown', event => {
      const items = [...menu?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); host.focus() }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      } else if (event.key === 'Tab') close()
    })
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    document.addEventListener('pointerdown', outside, true)
  }
  host.addEventListener('contextmenu', open)
  return () => { close(); host.removeEventListener('contextmenu', open) }
}
