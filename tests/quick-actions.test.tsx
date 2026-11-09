import { expect, test } from 'claude-code/testing'

import { DEFAULT_ACTIONS, fillInfo, groupBy, isShown, parseActions, parseRepo, parseStatus } from '../hooks/register'

const PANE = {
  plugin: 'quick-actions',
  component: 'Pane',
  requestId: 'quick-actions',
  props: { title: 'Actions', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const shaped = (shape: string, value: unknown) => ({ value: { value: { shape, value }, version: 1 } })

test('parseStatus reads branch, dirty, ahead and behind', () => {
  expect(parseStatus(128, '')).toEqual({ isRepo: false })
  expect(parseStatus(0, '## main...origin/main [ahead 2, behind 1]\n M a.ts\n?? b.ts\n')).toEqual({ isRepo: true, branch: 'main', dirty: 2, ahead: 2, behind: 1 })
})

test('parseActions keeps valid entries and skips the rest', () => {
  expect(parseRepo('{"repo":"C:/x"}')).toBe('C:/x')
  expect(parseRepo('[]')).toBe(undefined)
  expect(parseActions('nope')).toEqual([])
  expect(parseActions(JSON.stringify({ actions: DEFAULT_ACTIONS }))).toEqual(DEFAULT_ACTIONS)
  expect(parseActions('[{"label":"x"},{"label":"ok","skill":"foo","hotkey":"ab","when":"nope"}]')).toEqual([
    { label: 'ok', skill: 'foo', hotkey: undefined, icon: undefined, info: undefined, group: undefined, when: undefined, args: undefined },
  ])
})

test('fillInfo replaces markers', () => {
  expect(fillInfo('{dirty} cambios en {branch}', { isRepo: true, branch: 'main', dirty: 3, ahead: 0, behind: 0 })).toBe('3 cambios en main')
  expect(fillInfo('{dirty} cambios', null)).toBe(' cambios')
})

test('groupBy keeps first-appearance order, ungrouped first', () => {
  const mk = (label: string, group?: string) => ({ a: { label, group, prompt: 'p' } as const })
  const gs = groupBy([mk('a', 'Git'), mk('b'), mk('c', 'Rev'), mk('d', 'Git')])
  expect(gs.map(g => g.title)).toEqual([undefined, 'Git', 'Rev'])
  expect(gs[1]?.items.map(x => x.a.label)).toEqual(['a', 'd'])
})

test('isShown follows when and repo state', () => {
  const r = { isRepo: true as const, branch: 'main', dirty: 0, ahead: 1, behind: 0 }
  expect(isShown({ label: 'a', prompt: 'p' }, null)).toBe(true)
  expect(isShown({ label: 'a', prompt: 'p', when: 'repo' }, { isRepo: false })).toBe(false)
  expect(isShown({ label: 'a', prompt: 'p', when: 'dirty' }, r)).toBe(false)
  expect(isShown({ label: 'a', prompt: 'p', when: 'ahead' }, r)).toBe(true)
})

test('a skill button runs the command and a prompt button submits, on both surfaces', async ($, on) => {
  const ran: string[] = []
  const sent: string[] = []
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`)
    return { text: 'ok' }
  })
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('state.get', (_, e) =>
    e.key === 'repo'
      ? shaped('repo-1', { isRepo: true, branch: 'main', dirty: 1, ahead: 0, behind: 0 })
      : shaped('actions-1', [
          { label: 'Commit', when: 'dirty', prompt: 'commit it' },
          { label: 'Push', when: 'ahead', prompt: 'push it' },
          { label: 'Horas', skill: 'sprint-hours', args: 'solo total' },
        ]),
  )

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'a0' })).toBeTruthy()
    expect(await ui.find({ key: 'a1' })).toBeFalsy()
    expect(await ui.find({ key: 'a2' })).toBeTruthy()
    await ui.press({ key: 'a0' })
    await ui.press({ key: 'a2' })
    await ui.unmount()
  }
  expect(sent).toEqual(['commit it', 'commit it'])
  expect(ran).toEqual(['sprint-hours solo total', 'sprint-hours solo total'])
})
