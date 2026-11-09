import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Action, Repo, When } from '../types'

const PANE = 'quick-actions'
const TITLE = 'Actions'
const repo = atom({ plugin: 'quick-actions', key: 'repo' } as const, null, { shape: 'repo-1' })
const actions = atom({ plugin: 'quick-actions', key: 'actions' } as const, [], { shape: 'actions-1' })

export const DEFAULT_ACTIONS: Action[] = [
  { label: 'Status', group: 'Git', icon: '📋', when: 'repo', info: '{branch}', prompt: 'Show the git status of the repository: branch, pending changes and commits to push.' },
  { label: 'Commit', group: 'Git', icon: '💾', when: 'dirty', info: '{dirty} changes', prompt: 'Commit the pending changes with a descriptive message.' },
  { label: 'Pull', group: 'Git', icon: '⬇️', when: 'behind', info: '{behind} commits', prompt: 'Pull the current branch and tell me what changed.' },
  { label: 'Merge main', group: 'Git', icon: '🔀', when: 'repo', info: 'main → {branch}', prompt: 'Bring main into the current branch: git fetch, then merge origin/main. If there are conflicts, do not resolve them; list them and ask me.' },
  { label: 'Push', group: 'Git', icon: '⬆️', when: 'ahead', info: '{ahead} commits', prompt: 'Push the current branch to the remote.' },
  { label: 'Commit and push', group: 'Git', icon: '🚀', when: 'repo', info: '{dirty} changes · {ahead} to push', prompt: 'Commit the pending changes with a descriptive message and push the branch to the remote.' },
  { label: 'Create PR', group: 'Git', icon: '🔃', when: 'repo', info: '{branch} → main', prompt: 'Open a pull request from the current branch against main, with a clear title and description based on the commits that differ from main.' },
  { label: 'Run the app', group: 'Workflow', icon: '▶️', skill: 'run' },
  { label: 'Code review', group: 'Workflow', icon: '🧐', skill: 'code-review' },
  { label: 'Security review', group: 'Workflow', icon: '🔐', skill: 'security-review' },
  { label: 'Simplify', group: 'Workflow', icon: '✂️', skill: 'simplify' },
]

const WHENS: readonly When[] = ['repo', 'dirty', 'ahead', 'behind']

// The file is the person's own; a malformed entry is skipped, not fatal.
export function parseActions(text: string): Action[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(raw) ? raw : (raw as { actions?: unknown } | null)?.actions
  if (!Array.isArray(list)) return []
  const out: Action[] = []
  for (const a of list as Record<string, unknown>[]) {
    if (typeof a?.label !== 'string') continue
    const hotkey = typeof a.hotkey === 'string' && a.hotkey.length === 1 ? a.hotkey : undefined
    const icon = typeof a.icon === 'string' && a.icon.length > 0 && a.icon.length <= 8 ? a.icon : undefined
    const info = typeof a.info === 'string' && a.info.length > 0 ? a.info : undefined
    const group = typeof a.group === 'string' && a.group.length > 0 ? a.group : undefined
    const when = WHENS.includes(a.when as When) ? (a.when as When) : undefined
    if (typeof a.skill === 'string') out.push({ label: a.label, hotkey, icon, info, group, when, skill: a.skill, args: typeof a.args === 'string' ? a.args : undefined })
    else if (typeof a.prompt === 'string') out.push({ label: a.label, hotkey, icon, info, group, when, prompt: a.prompt })
  }
  return out
}

// Markers in `info`: {branch} {dirty} {ahead} {behind}; without a repo they read as empty.
export function fillInfo(info: string, r: Repo | null): string {
  const v = r?.isRepo ? r : { branch: '', dirty: '', ahead: '', behind: '' }
  return info.replace(/{(branch|dirty|ahead|behind)}/g, (_, k: keyof typeof v) => String(v[k]))
}

// Groups in order of first appearance; ungrouped actions come first under no title.
export function groupBy<T extends { a: Action }>(list: T[]): { title?: string; items: T[] }[] {
  const out: { title?: string; items: T[] }[] = []
  for (const x of list) {
    let g = out.find(o => o.title === x.a.group)
    if (g === undefined) {
      g = { title: x.a.group, items: [] }
      if (x.a.group === undefined) out.unshift(g)
      else out.push(g)
    }
    g.items.push(x)
  }
  return out
}

export function isShown(a: Action, r: Repo | null): boolean {
  if (a.when === undefined) return true
  if (r === null || !r.isRepo) return false
  return a.when === 'repo' || r[a.when] > 0
}

// `git status --porcelain=v1 -b`: first line `## branch...origin/branch [ahead 1, behind 2]`, one line per changed file after.
export function parseStatus(exitCode: number, stdout: string): Repo {
  if (exitCode !== 0) return { isRepo: false }
  const [head = '', ...files] = stdout.split('\n').filter(l => l.length > 0)
  const branch = (head.replace(/^## /, '').split('...')[0] ?? '').split(' ')[0] ?? ''
  const n = (re: RegExp) => Number(head.match(re)?.[1] ?? 0)
  return { isRepo: true, branch, dirty: files.length, ahead: n(/ahead (\d+)/), behind: n(/behind (\d+)/) }
}

async function configPath($: EngineInterface) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  return `${home}/.claude/quick-actions.json`
}

// Optional top-level "repo" in the JSON: the folder git runs in; absent, the session's own.
// A module variable is enough: a reload runs session.start, which loads the file again.
let repoDir: string | undefined

export function parseRepo(text: string): string | undefined {
  try {
    const raw = JSON.parse(text) as { repo?: unknown } | null
    return typeof raw?.repo === 'string' && raw.repo.length > 0 ? raw.repo : undefined
  } catch {
    return undefined
  }
}

async function loadActions($: EngineInterface) {
  const path = await configPath($)
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    text = JSON.stringify({ actions: DEFAULT_ACTIONS }, null, 2)
    await $.fs.write(path, text).catch(() => undefined)
  }
  repoDir = parseRepo(text)
  await update($, actions, () => parseActions(text))
}

async function refreshRepo($: EngineInterface) {
  const { exitCode, stdout } = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { cwd: repoDir }).catch(() => ({ exitCode: 128, stdout: '' }))
  await update($, repo, () => parseStatus(exitCode, stdout))
}

function run($: EngineInterface, a: Action) {
  const where = repoDir !== undefined && a.when !== undefined ? `In the repository ${repoDir}: ` : ''
  const done = a.skill !== undefined
    ? $.command.run({ command: a.skill, args: a.args })
    : $.prompt.submit({ text: where + a.prompt, asUser: true })
  done.catch(err => $.ui.toast(`${a.label}: ${String(err)}`))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'quick-actions', description: 'Open the quick actions pane and reload ~/.claude/quick-actions.json' })
    void $.ui.open({ id: PANE, title: TITLE })
    void loadActions($)
    void refreshRepo($)
    $.clock.every(30_000, () => {
      void loadActions($)
      void refreshRepo($)
    })

    return next(e)
  })

  on('command.run', { command: 'quick-actions' }, async $ => {
    await loadActions($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Quick actions pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    void refreshRepo($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const r = await read($, repo)
    const list = (await read($, actions)).map((a, i) => ({ a, i })).filter(({ a }) => isShown(a, r))


    return (
      <Box flexDirection="column" gap={1}>
        <Box paddingX={1}>
          {r?.isRepo
            ? <Text><Text color={r.dirty > 0 ? 'warning' : 'success'} bold>● {r.branch}</Text><Text dimColor>  {r.dirty} changes · ↑{r.ahead} · ↓{r.behind}</Text></Text>
            : <Text dimColor>{r === null ? '○ Reading the repo...' : '○ No git repository here.'}</Text>}
        </Box>
        {list.length === 0 && <Text dimColor>No actions. Edit ~/.claude/quick-actions.json</Text>}
        {groupBy(list).map(g => (
          <Box flexDirection="column" paddingX={1}>
            {g.title !== undefined && <Text bold>{g.title}</Text>}
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {g.items.map(({ a, i }) => (
                <Box flexDirection="column">
                  <Button key={`a${i}`} variant={a.skill !== undefined ? 'primary' : 'secondary'} onPress={() => run($, a)}>
                    {a.icon !== undefined ? `${a.icon} ` : ''}{a.label}
                  </Button>
                  {a.info !== undefined ? <Text dimColor>{fillInfo(a.info, r)}</Text> : a.skill !== undefined && <Text dimColor>/{a.skill}</Text>}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}
