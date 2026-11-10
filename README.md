# Quick Actions

A Claude Code mod that adds a pane of buttons beside the chat. Each button either
sends a prompt to Claude or runs a skill, exactly as if you had typed it. Git
buttons show live information (branch, pending changes, commits ahead/behind) and
appear only when the repository state calls for them: no **Commit** button without
pending changes, no **Push** button without commits to push.

The list of buttons is yours: it lives in `~/.claude/quick-actions.json`.

```
 ● main  2 changes · ↑1 · ↓0

 Git
 [ 📋 Status ]  [ 💾 Commit ]  [ 🔀 Merge main ]  [ ⬆️ Push ]  [ 🚀 Commit and push ]  [ 🔃 Create PR ]
 main           2 changes      main → main       1 commits   2 changes · 1 to push   main → main

 Workflow
 [ ▶️ Run the app ]  [ 🧐 Code review ]  [ 🔐 Security review ]  [ ✂️ Simplify ]
 /run               /code-review       /security-review       /simplify
```

Buttons with a dim `/name` under them run a skill; the others send a prompt.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install quick-actions --marketplace mabuenox/cc-hotbar
```

Answer `y` to add the marketplace, then choose a scope (user scope, the first
option, loads the mod in every session). From a shell:

```
claude plugin install quick-actions --marketplace mabuenox/cc-hotbar
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt
box, then **Plugins**, **Add marketplace** with `mabuenox/cc-hotbar`, then **Add plugin**.

Requires a Claude Code build with mod support (hooks modules). Developed on 2.1.319.

## Usage

- The pane opens by itself at session start. In a terminal it needs about 110
  columns to be placed; narrower than that it waits until there is room.
- `/quick-actions` reopens the pane and reloads the configuration file.
- Press a button: a **prompt** button submits its text as your own message; a
  **skill** button runs `/skill args` as if you had typed it, so skills that only
  the user may invoke work too.
- The first line shows the repository state: `● branch`, in yellow when there are
  pending changes and green when clean, then the counts of changes, commits ahead
  (↑) and behind (↓). Without a repository it reads `○ No git repository here.`
- The state refreshes every 30 seconds and after every tool call Claude makes, so
  the buttons follow what Claude just did.

## Configuration

The file is `~/.claude/quick-actions.json` (`%USERPROFILE%\.claude\quick-actions.json`
on Windows). It is written with the default actions the first time the mod runs
when it does not exist; from then on the mod only reads it. Edit it freely: the
mod re-reads it every 30 seconds and on `/quick-actions`.

```json
{
  "repo": "C:/Workspace/my-repo",
  "actions": [
    { "label": "Status", "group": "Git", "icon": "📋", "when": "repo", "info": "{branch}",
      "prompt": "Show the git status of the repository: branch, pending changes and commits to push." },
    { "label": "Commit", "group": "Git", "icon": "💾", "when": "dirty", "info": "{dirty} changes",
      "prompt": "Commit the pending changes with a descriptive message." },
    { "label": "Code review", "group": "Workflow", "icon": "🧐", "skill": "code-review" },
    { "label": "Interview me", "group": "Workflow", "icon": "🎤", "skill": "interview", "args": "about this feature" },
    { "label": "Explain this repo", "icon": "📖", "prompt": "Explain the architecture of this repository in a few paragraphs." }
  ]
}
```

The top level may be the object above or a bare array of actions.

### Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `repo` | string, optional | Folder the git buttons work on. Absent, the session's working directory. When set, prompts of git-aware buttons (those with `when`) are prefixed with `In the repository <repo>:` so Claude acts there. |
| `actions` | array | The buttons, in the order they are shown. |

### Action fields

Every action needs a `label` and exactly one of `prompt` or `skill`.

| Field | Type | Meaning |
| --- | --- | --- |
| `label` | string | Text on the button. |
| `prompt` | string | Text sent to Claude as your message when the button is pressed. |
| `skill` | string | Skill or slash command to run, without the leading `/` (`code-review`, `ponytail:ponytail-review`). |
| `args` | string, optional | Arguments passed to the skill, as if typed after its name. |
| `icon` | string, optional | Emoji or short text (up to 8 characters) shown before the label. |
| `group` | string, optional | Title the button is listed under. Groups appear in the order their first button appears; ungrouped buttons come first, without a title. |
| `when` | `repo`, `dirty`, `ahead` or `behind`, optional | Show the button only when there is a git repository (`repo`), when it has pending changes (`dirty`), commits to push (`ahead`) or commits to pull (`behind`). Absent, the button is always shown. |
| `info` | string, optional | Dim line under the button. May use the markers below. Without `info`, a skill button shows `/skill` there. |

### Markers in `info`

| Marker | Replaced by |
| --- | --- |
| `{branch}` | Current branch name |
| `{dirty}` | Number of changed files (staged, unstaged and untracked) |
| `{ahead}` | Commits ahead of the upstream branch |
| `{behind}` | Commits behind the upstream branch |

Without a repository every marker reads as empty text.

### Validation

A malformed entry is skipped, never fatal: an action without `label`, or without
`prompt` or `skill`, is ignored; an `icon` longer than 8 characters, an empty
`info` or `group`, or an unknown `when` are dropped from an otherwise valid
action. A file that is not valid JSON yields an empty pane with a hint to edit it.

## Default actions

Written to the configuration file on first run. Delete or edit any of them.

| Group | Button | Shown when | Does |
| --- | --- | --- | --- |
| Git | 📋 Status | repo | Asks for branch, pending changes and commits to push |
| Git | 🌿 Switch branch | repo | Fetches, lists local and `origin` branches, asks which one to check out and switches; stops first if there are uncommitted changes |
| Git | 💾 Commit | dirty | Commits the pending changes with a descriptive message |
| Git | ⬇️ Pull | behind | Pulls the current branch and summarises what changed |
| Git | 🔀 Merge main | repo | Fetches and merges `origin/main` into the current branch; lists conflicts instead of resolving them |
| Git | ⬆️ Push | ahead | Pushes the current branch |
| Git | 🚀 Commit and push | repo | Commits and pushes |
| Git | 🔃 Create PR | repo | Opens a pull request against `main` with a title and description from the commits |
| Workflow | ▶️ Run the app | always | `/run` |
| Workflow | 🧐 Code review | always | `/code-review` |
| Workflow | 🔐 Security review | always | `/security-review` |
| Workflow | ✂️ Simplify | always | `/simplify` |

## How it works

- `hooks/register.tsx` is the hooks module. On `session.start` it registers the
  `/quick-actions` command, opens the pane, loads the configuration and starts a
  30-second timer. A `tool.call` hook refreshes the git state after each tool
  Claude runs. The `ui.render` hook draws the pane from two state atoms: `repo`
  (parsed `git status --porcelain=v1 -b`) and `actions` (the parsed file).
- Git runs through the engine's process API, with no shell and no git hooks, so a
  button press never executes anything on its own: it only asks Claude.
- Prompt buttons call `$.prompt.submit` with `asUser: true`; skill buttons call
  `$.command.run`, which is the only way a mod may run a slash command.
- `types/index.d.ts` declares the two state values and the `Action` type, so
  `claude plugin validate` checks every state key against it.

## Development

```
git clone https://github.com/mabuenox/cc-hotbar
claude --plugin-dir ./quick-actions        # loads the mod for one session and hot-reloads on save
claude plugin validate .                   # manifest, marketplace file and hooks module
claude plugin test .                       # runs tests/*.test.tsx against the engine
npx -y -p typescript@5.6.3 tsc -p .        # type-check, once the mod has loaded at least once
```

Type-checking needs `.claude-plugin/types/`, which the engine writes the first time
it loads the mod; the folder is git-ignored. Tests mock the engine (`state.get`,
`prompt.submit`, `command.run`) and mount the pane on both the terminal and the
desktop surfaces.

```
.claude-plugin/plugin.json        manifest
.claude-plugin/marketplace.json   makes this repository installable with /plugin install
hooks/hooks.json                  names the hooks module
hooks/register.tsx                the mod
types/index.d.ts                  state contract and Action type
tests/quick-actions.test.tsx      parsing, visibility, grouping and button behaviour
```

## Known limits

- A `when` condition cannot depend on the branch name, so **Merge main** and
  **Create PR** are also shown while on `main`.
- The terminal inverts a button's colours while the pointer is over it; the mod
  cannot change that.
- A skill button whose skill is not installed shows a toast with the error from
  Claude Code when pressed.
- Only one configuration file is read, in the home folder; there is no per-project
  file.

## License

MIT. See `LICENSE`.
