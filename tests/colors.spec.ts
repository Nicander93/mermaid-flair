import { expect, test } from '@playwright/test'
import { flowColorKeys } from '../packages/renderer/src/colors'
import type { FlowColors } from '../packages/renderer/src/colors'

function model(ids: string[], groups: { id: string; nodes: string[] }[], edges: { start: string; end: string }[] = []): FlowColors {
  return {
    vertices: ids.map(id => ({ id, domId: id, labelType: 'text', styles: [], classes: [] })),
    groups: groups.map(group => ({ ...group, title: group.id, labelType: 'text', classes: [] })),
    edges, classes: new Map(),
  }
}

test('uses explicit ancestry and keeps unrelated source order out of color identity', () => {
  const data = model(['a', 'b', 'c'], [{ id: 'outer', nodes: ['inner', 'a'] }, { id: 'inner', nodes: ['b'] }, { id: 'other', nodes: ['c'] }])
  const keys = flowColorKeys(data)
  expect(keys.get('a')).toBe(keys.get('b'))
  expect(keys.get('c')).not.toBe(keys.get('a'))
  expect(flowColorKeys({ ...data, vertices: [...data.vertices].reverse(), groups: [...data.groups].reverse() })).toEqual(keys)
})

test('inherits tree branches but does not assign shared or cyclic nodes to arbitrary parents', () => {
  const data = model(['root', 'a', 'b', 'c'], [], [{ start: 'root', end: 'a' }, { start: 'root', end: 'b' }, { start: 'a', end: 'c' }])
  const tree = flowColorKeys(data)
  expect(tree.get('a')).toBe(tree.get('c'))
  expect(tree.get('a')).not.toBe(tree.get('b'))
  const shared = flowColorKeys({ ...data, edges: [...data.edges, { start: 'b', end: 'c' }] })
  expect(shared.get('c')).toBe('node:c')
  const cycle = flowColorKeys({ ...data, edges: [...data.edges, { start: 'c', end: 'root' }] })
  expect(cycle.get('root')).toBe('node:root')
})
