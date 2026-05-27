---
name: ai-task-manager
description: Natural-language task control for ai-task. Use when the user wants to manage project tasks or continue work by describing tasks in plain language instead of CLI commands. Supports listing tasks, switching the current focus task, marking tasks done or blocked, updating task status, saving session progress, syncing task data, and reading the current task prompt before continuing work.
---

# AI Task Manager

Use `ai-task` as the execution layer. Do not ask the user to type CLI commands unless they explicitly want the commands.

## Core rule

Translate natural-language task requests into `ai-task` commands, then summarize the result back to the user in plain language.

Prefer these intents:

- List tasks
- Switch to a task
- Continue the current task
- Mark a task done
- Mark a task blocked
- Update task progress or next action
- Save current progress
- Sync handoff data

## Required workflow

When the user asks what tasks exist:

1. Run `ai-task task list`
2. Summarize:
   - current focus task first
   - then other open tasks
   - mention blocked tasks only if relevant

When the user says "go do xxx", "switch to xxx", or "work on xxx":

1. Match the task by id or title.
2. If one task matches, run `ai-task task focus TASK-xxx`.
3. Immediately run `ai-task current`.
4. Use the current-task output as the working context for the next implementation step.

When the user says "continue current task":

1. Run `ai-task current`.
2. Use the current-task output as the working context.
3. If there is no focus task, say so and ask which task to focus.

When the user says a task is done:

1. Match the task.
2. Run `ai-task task done TASK-xxx --note "<short summary>"`
3. Then run `ai-task task list`.
4. Tell the user the task is complete and what remaining tasks exist.
5. If there is no focus task after completion, recommend the next open high-priority task.

When the user says a task is blocked:

1. Match the task.
2. Run `ai-task task block TASK-xxx --note "<reason>"`
3. Summarize the blocked state and remaining open tasks.

When the user updates task progress:

1. Match the task.
2. Run `ai-task task update TASK-xxx ...`
3. Use `--status`, `--next-action`, and `--note` when the user gave that information.

When the user says "save progress", "record current progress", or similar:

1. Ensure there is a focus task when possible.
2. Run `ai-task save --note "<short summary from user intent>"`
3. Tell the user progress was saved and task prompts were refreshed.

When the user says "sync", "push handoff", or similar:

1. Run `ai-task sync`
2. Confirm the handoff repository was synced.

## Matching rules

Prefer exact task id matches such as `TASK-001`.

Otherwise match by task title from `ai-task task list`.

If multiple tasks could match:

1. Do not guess.
2. Ask the user which task they mean.

If no task matches and the user clearly intends new work:

1. Ask whether to create a new task.
2. If the user confirms, create it with `ai-handoff task add`.

## Output style

Keep responses short and execution-focused.

Good examples:

- `Current focus task is TASK-001: analysis chart mapping issue. There is one other open task: TASK-002 month filter feature.`
- `Switched to TASK-002. Next action: confirm the filter entry page and interaction.`
- `Marked TASK-002 done. Remaining open task: TASK-001.`

Do not dump raw CLI output unless the user asks for it.

## Current-task rule

After any successful focus switch, treat `.ai/current-task.md` and `.ai/current-task-prompt.txt` as the primary context for continuing implementation.

If the user's next request is implementation work, use the current-task context first and avoid unrelated refactors.
