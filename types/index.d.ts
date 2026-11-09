export type Repo =
  | { isRepo: false }
  | { isRepo: true; branch: string; dirty: number; ahead: number; behind: number }

export type When = 'repo' | 'dirty' | 'ahead' | 'behind'

export type Action = {
  label: string
  hotkey?: string
  icon?: string
  info?: string
  group?: string
  when?: When
} & ({ prompt: string; skill?: undefined } | { skill: string; args?: string; prompt?: undefined })

declare module 'claude-code' {
  interface PluginState {
    'quick-actions': { repo: Shaped<Repo | null>; actions: Shaped<Action[]> }
  }
}
