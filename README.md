# ai-task-manager

Unified repository for:

- the `ai-task` CLI
- the `ai-task-manager` Skill

## Documentation

- Installation and usage: [INSTALL_AND_USAGE.md](./INSTALL_AND_USAGE.md)

## Structure

```text
ai-task-manager/
|- packages/
|  `- cli/
`- skills/
   `- ai-task-manager/
```

## Install the CLI

From `packages/cli`:

```powershell
npm.cmd link
```

After that, verify:

```powershell
ai-task --help
```

For full setup instructions, including `ai-task config`, `ai-task init`, and daily workflow examples, see [INSTALL_AND_USAGE.md](./INSTALL_AND_USAGE.md).

## Install the Skill

The repository contains a single generic Skill:

- `skills/ai-task-manager`

Install that Skill into whatever AI tool you use.

If you switch AI tools later, reinstall the same Skill into the new tool. The CLI does not need to be reinstalled just because the AI tool changes.

## Typical usage

Use the CLI directly:

```powershell
ai-task task list
ai-task task focus TASK-001
ai-task current
ai-task save --note "today I finished X and will continue Y next"
ai-task sync
```

Use the Skill through natural-language task requests such as:

- `当前有哪些任务`
- `去做某个任务`
- `继续当前任务`
- `把某个任务标记为完成`
- `保存当前任务进度`

## Notes

- This repository assumes `npm.cmd` is available on Windows.
- The current machine may still have a broken `npm` shim in `C:\Windows\System32\npm`, so use `npm.cmd` if plain `npm` does not work.
