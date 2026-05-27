# ai-task CLI

Cross-platform CLI for AI task management across devices and across coding agents.

## Commands

```bash
ai-task config
ai-task init
ai-task save --note "today I finished X, Y is still pending"
ai-task resume
ai-task prompt
ai-task current
ai-task sync
ai-task task add --title "..." --priority high --category bug --next-action "..."
ai-task task list
ai-task task focus TASK-001
ai-task task update TASK-001 --status in_progress --next-action "..."
ai-task task done TASK-001 --note "completed"
```

## Config Model

Global config:

- macOS / Linux: `~/.ai-task/config.json`
- Windows: `%USERPROFILE%/.ai-task/config.json`

Project config:

- `.ai-task.json`

## Expected Workflow

1. Create a dedicated GitHub repo for task documents.
2. Clone that repo locally on each machine.
3. Run `ai-task config` once on each machine.
4. Run `ai-task init` once in each code repository.
5. After each session:

```bash
ai-task task add --title "..." --priority high --category bug --next-action "..."
ai-task task focus TASK-001
ai-task save --note "what changed in this session"
ai-task sync
```

6. On another machine:

```bash
git pull
ai-task resume
```

Then tell the next AI:

```text
Please read .ai/latest-summary.md and .ai/resume-prompt.txt, summarize the current state, and continue the next concrete task without changing unrelated parts.
```

## V2 Task-Driven Model

The second version stores structured project tasks, a current focus task, and per-session snapshots.

Each project in the handoff-center repo now contains:

```text
<project>/
  project-meta.json
  context.md
  tasks.json
  tasks.md
  handoff.md
  latest-summary.md
  resume-prompt.txt
  sessions/
```

Key ideas:

- `tasks.json` is the source of truth for open and completed work.
- `project-meta.json` tracks the current focus task and last session id.
- each `save` creates a new session snapshot in `sessions/`.
- `latest-summary.md` tells the next AI what to continue first.
- each task also gets its own markdown and prompt artifact under `tasks/`.
- switching the focus task updates `.ai/current-task.md` and `.ai/current-task-prompt.txt`.

## Example Using The Current Task Center

Task repo URL:

```text
https://github.com/zhouyouyou872-coder/ai-handoff-center
```

Local path on this machine:

```text
C:\Users\admin\ai-handoff-center
```

You can configure the tool non-interactively:

```bash
ai-task config --repo-url "https://github.com/zhouyouyou872-coder/ai-handoff-center" --repo-path "C:\Users\admin\ai-handoff-center" --branch main
```

Then, inside a project repository:

```bash
ai-task init --project-id minigram-ledger --repo-url "https://github.com/zhouyouyou872-coder/minigram-ledger.git" --branch main
ai-task save --note "today I finished X, Y is still pending"
ai-task sync
```

## Install For Local Testing

From this directory:

```bash
npm link
```

After that the `ai-task` command should be available globally on the current machine.
