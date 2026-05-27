#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const readline = require("readline");

const CONFIG_DIR = path.join(os.homedir(), ".ai-task");
const GLOBAL_CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const PROJECT_CONFIG_FILE = ".ai-task.json";
const AI_DIR = ".ai";
const SUMMARY_FILE = path.join(AI_DIR, "latest-summary.md");
const PROMPT_FILE = path.join(AI_DIR, "resume-prompt.txt");
const LOCAL_TASKS_FILE = path.join(AI_DIR, "tasks.md");
const LOCAL_CURRENT_TASK_FILE = path.join(AI_DIR, "current-task.md");
const LOCAL_CURRENT_TASK_PROMPT_FILE = path.join(AI_DIR, "current-task-prompt.txt");
const DEFAULT_TASK_REPO_URL = "https://github.com/zhouyouyou872-coder/ai-handoff-center";
const DEFAULT_TASK_REPO_PATH = path.join(os.homedir(), "ai-handoff-center");
const DEFAULT_SYNC_BRANCH = "main";
const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "dropped"];
const TASK_PRIORITIES = ["high", "medium", "low"];

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "config":
      await commandConfig(args);
      return;
    case "init":
      await commandInit(args);
      return;
    case "save":
      await commandSave(args);
      return;
    case "resume":
      await commandResume();
      return;
    case "prompt":
      await commandPrompt();
      return;
    case "current":
      await commandCurrent();
      return;
    case "sync":
      await commandSync(args);
      return;
    case "task":
      await commandTask(args);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  console.log(`ai-task

Commands:
  ai-task config [--repo-url <url>] [--repo-path <path>] [--branch <branch>]
  ai-task init [--project-id <id>] [--repo-url <url>] [--branch <branch>]
  ai-task save [--note "<text>"]
  ai-task resume
  ai-task prompt
  ai-task current
  ai-task sync [--message "<commit message>"]

Task commands:
  ai-task task add --title "<title>" [--priority high|medium|low] [--category <name>] [--next-action "<text>"] [--files "a,b"] [--note "<text>"]
  ai-task task list [--status <status>] [--priority <priority>]
  ai-task task update <task-id> [--title "<title>"] [--status <status>] [--priority <priority>] [--category <name>] [--next-action "<text>"] [--files "a,b"] [--note "<text>"]
  ai-task task focus <task-id>
  ai-task task done <task-id> [--note "<text>"]
  ai-task task block <task-id> [--note "<text>"]

Config model:
  Global config: ~/.ai-task/config.json
  Project config: .ai-task.json
`);
}

async function commandConfig(args) {
  ensureDir(CONFIG_DIR);
  const current = readJsonIfExists(GLOBAL_CONFIG_FILE) || {};

  const defaults = {
    taskRepoUrl: readArgValue(args, "--repo-url") || current.taskRepoUrl || current.handoffRepoUrl || DEFAULT_TASK_REPO_URL,
    taskRepoPath: readArgValue(args, "--repo-path") || current.taskRepoPath || current.handoffRepoPath || DEFAULT_TASK_REPO_PATH,
    defaultSyncBranch: readArgValue(args, "--branch") || current.defaultSyncBranch || DEFAULT_SYNC_BRANCH
  };

  const answers = hasAnyArgs(args)
    ? defaults
    : await promptMany([
        { key: "taskRepoUrl", label: "Task repo GitHub URL", defaultValue: defaults.taskRepoUrl },
        { key: "taskRepoPath", label: "Local cloned task repo path", defaultValue: defaults.taskRepoPath },
        { key: "defaultSyncBranch", label: "Default sync branch", defaultValue: defaults.defaultSyncBranch }
      ]);

  writeJson(GLOBAL_CONFIG_FILE, answers);
  console.log(`Saved global config to ${GLOBAL_CONFIG_FILE}`);
}

async function commandInit(args) {
  ensureGitRepo(process.cwd());
  const existing = readJsonIfExists(path.join(process.cwd(), PROJECT_CONFIG_FILE)) || {};
  const inferredRepo = safeGit("config --get remote.origin.url") || "";
  const inferredBranch = safeGit("branch --show-current") || "main";
  const inferredProjectId = existing.projectId || path.basename(process.cwd());

  const defaults = {
    projectId: readArgValue(args, "--project-id") || inferredProjectId,
    repoUrl: readArgValue(args, "--repo-url") || existing.repoUrl || inferredRepo,
    defaultBranch: readArgValue(args, "--branch") || existing.defaultBranch || inferredBranch
  };

  const answers = hasAnyArgs(args)
    ? defaults
    : await promptMany([
        { key: "projectId", label: "Project ID in task repo", defaultValue: defaults.projectId },
        { key: "repoUrl", label: "Current code repo URL", defaultValue: defaults.repoUrl },
        { key: "defaultBranch", label: "Default branch", defaultValue: defaults.defaultBranch }
      ]);

  writeJson(path.join(process.cwd(), PROJECT_CONFIG_FILE), answers);
  ensureDir(path.join(process.cwd(), AI_DIR));

  const taskState = ensureProjectTaskState(answers, readGlobalConfigOptional());
  syncLocalArtifacts(taskState);

  console.log(`Initialized project config at ${path.join(process.cwd(), PROJECT_CONFIG_FILE)}`);
}

async function commandSave(args) {
  const note = readArgValue(args, "--note") || "";
  const projectConfig = readRequiredProjectConfig();
  const globalConfig = readRequiredGlobalConfig();
  const projectDir = getProjectTaskDir(globalConfig, projectConfig);
  const state = ensureProjectTaskState(projectConfig, globalConfig);
  const sessionId = buildSessionId();

  const repoState = collectRepoState(projectConfig);
  const openTasks = state.tasks.tasks.filter((task) => !isClosedStatus(task.status));
  const focusTask = findTaskById(state.tasks, state.meta.current_focus_task_id);

  const session = {
    id: sessionId,
    created_at: new Date().toISOString(),
    note,
    current_focus_task_id: state.meta.current_focus_task_id || "",
    open_task_ids: openTasks.map((task) => task.id),
    branch: repoState.branch,
    commit: repoState.commit,
    git_status: repoState.status,
    recent_commits: repoState.recentLog
  };

  writeJson(path.join(state.sessionsDir, `${sessionId}.json`), session);
  fs.writeFileSync(path.join(state.sessionsDir, `${sessionId}-session.md`), buildSessionMarkdown(session, focusTask, openTasks), "utf8");

  state.meta.repo = projectConfig.repoUrl;
  state.meta.branch = repoState.branch;
  state.meta.commit = repoState.commit;
  state.meta.updated_at = session.created_at;
  state.meta.last_session_id = sessionId;
  state.meta.active_task_ids = openTasks.map((task) => task.id);

  fs.writeFileSync(state.tasksMdPath, renderTasksMarkdown(state.tasks), "utf8");
  fs.writeFileSync(state.summaryPath, buildSummaryV2(projectConfig, globalConfig, state.meta, repoState, focusTask, openTasks, note), "utf8");
  fs.writeFileSync(state.promptPath, buildPromptV2(focusTask), "utf8");
  writeJson(state.metaPath, state.meta);

  syncLocalArtifacts(state);

  console.log(`Updated ${SUMMARY_FILE}`);
  console.log(`Updated ${PROMPT_FILE}`);
  console.log(`Created session snapshot ${sessionId}`);
  console.log(`Mirrored task data into ${projectDir}`);
}

async function commandResume() {
  ensureFile(path.join(process.cwd(), SUMMARY_FILE), "Run `ai-task save` first.");
  ensureFile(path.join(process.cwd(), PROMPT_FILE), "Run `ai-task save` first.");
  console.log(fs.readFileSync(path.join(process.cwd(), SUMMARY_FILE), "utf8"));
  console.log("\n---\n");
  console.log(fs.readFileSync(path.join(process.cwd(), PROMPT_FILE), "utf8"));
}

async function commandPrompt() {
  ensureFile(path.join(process.cwd(), PROMPT_FILE), "Run `ai-task save` first.");
  console.log(fs.readFileSync(path.join(process.cwd(), PROMPT_FILE), "utf8"));
}

async function commandCurrent() {
  ensureFile(path.join(process.cwd(), LOCAL_CURRENT_TASK_FILE), "Set a focus task first.");
  ensureFile(path.join(process.cwd(), LOCAL_CURRENT_TASK_PROMPT_FILE), "Set a focus task first.");
  console.log(fs.readFileSync(path.join(process.cwd(), LOCAL_CURRENT_TASK_FILE), "utf8"));
  console.log("\n---\n");
  console.log(fs.readFileSync(path.join(process.cwd(), LOCAL_CURRENT_TASK_PROMPT_FILE), "utf8"));
}

async function commandSync(args) {
  const message = readArgValue(args, "--message") || "docs: sync AI task data";
  const globalConfig = readRequiredGlobalConfig();
  const projectConfig = readRequiredProjectConfig();
  const repoPath = globalConfig.taskRepoPath;
  const branch = globalConfig.defaultSyncBranch || "main";
  const projectDir = getProjectTaskDir(globalConfig, projectConfig);

  if (!fs.existsSync(projectDir)) {
    throw new Error(`No mirrored task data found in ${projectDir}. Run \`ai-task save\` first.`);
  }

  ensureGitRepo(repoPath);
  runGit(repoPath, "pull --rebase");
  runGit(repoPath, "add .");

  const status = safeGitInRepo(repoPath, "status --short");
  if (!status) {
    console.log("No task repo changes to sync.");
    return;
  }

  runGit(repoPath, `commit -m ${quote(message)}`);
  runGit(repoPath, `push origin ${branch}`);
  console.log(`Synced task data for ${projectConfig.projectId}`);
}

async function commandTask(args) {
  const sub = args[0];

  switch (sub) {
    case "add":
      await taskAdd(args.slice(1));
      return;
    case "list":
      await taskList(args.slice(1));
      return;
    case "update":
      await taskUpdate(args.slice(1));
      return;
    case "focus":
      await taskFocus(args.slice(1));
      return;
    case "done":
      await taskSetStatus(args.slice(1), "done");
      return;
    case "block":
      await taskSetStatus(args.slice(1), "blocked");
      return;
    default:
      throw new Error("Unknown task command.");
  }
}

async function taskAdd(args) {
  const title = readArgValue(args, "--title");
  if (!title) {
    throw new Error("`ai-task task add` requires --title.");
  }

  const state = ensureConfiguredProjectState();
  const now = new Date().toISOString();
  const task = {
    id: nextTaskId(state.tasks),
    title,
    status: "todo",
    priority: normalizePriority(readArgValue(args, "--priority") || "medium"),
    category: readArgValue(args, "--category") || "general",
    source_session_id: state.meta.last_session_id || "",
    updated_at: now,
    next_action: readArgValue(args, "--next-action") || "",
    notes: parseListArg(readArgValue(args, "--note")),
    related_files: parseListArg(readArgValue(args, "--files"))
  };

  state.tasks.tasks.push(task);
  if (!state.meta.current_focus_task_id) {
    state.meta.current_focus_task_id = task.id;
  }

  persistTaskState(state);
  console.log(`Added ${task.id}: ${task.title}`);
}

async function taskList(args) {
  const state = ensureConfiguredProjectState();
  const statusFilter = readArgValue(args, "--status");
  const priorityFilter = readArgValue(args, "--priority");

  const tasks = state.tasks.tasks.filter((task) => {
    if (statusFilter && task.status !== statusFilter) {
      return false;
    }
    if (priorityFilter && task.priority !== priorityFilter) {
      return false;
    }
    return true;
  });

  if (!tasks.length) {
    console.log("No tasks found.");
    return;
  }

  for (const task of tasks) {
    const focusMark = task.id === state.meta.current_focus_task_id ? " [focus]" : "";
    console.log(`${task.id} ${task.title} [${task.status}] [${task.priority}]${focusMark}`);
    if (task.next_action) {
      console.log(`  next: ${task.next_action}`);
    }
  }
}

async function taskUpdate(args) {
  const taskId = args[0];
  if (!taskId) {
    throw new Error("`ai-task task update` requires a task id.");
  }

  const state = ensureConfiguredProjectState();
  const task = requireTask(state.tasks, taskId);

  updateTaskFields(task, args.slice(1));
  task.updated_at = new Date().toISOString();

  persistTaskState(state);
  console.log(`Updated ${task.id}`);
}

async function taskFocus(args) {
  const taskId = args[0];
  if (!taskId) {
    throw new Error("`ai-task task focus` requires a task id.");
  }

  const state = ensureConfiguredProjectState();
  requireTask(state.tasks, taskId);
  state.meta.current_focus_task_id = taskId;

  persistTaskState(state);
  console.log(`Focus set to ${taskId}`);
}

async function taskSetStatus(args, status) {
  const taskId = args[0];
  if (!taskId) {
    throw new Error(`task id is required for setting status ${status}.`);
  }

  const state = ensureConfiguredProjectState();
  const task = requireTask(state.tasks, taskId);
  task.status = status;
  task.updated_at = new Date().toISOString();

  const note = readArgValue(args.slice(1), "--note");
  if (note) {
    task.notes = task.notes || [];
    task.notes.push(note);
  }

  if (status === "done" && state.meta.current_focus_task_id === task.id) {
    const nextOpen = state.tasks.tasks.find((candidate) => !isClosedStatus(candidate.status) && candidate.id !== task.id);
    state.meta.current_focus_task_id = nextOpen ? nextOpen.id : "";
  }

  persistTaskState(state);
  console.log(`${task.id} marked as ${status}`);
}

function ensureConfiguredProjectState() {
  const projectConfig = readRequiredProjectConfig();
  const globalConfig = readRequiredGlobalConfig();
  return ensureProjectTaskState(projectConfig, globalConfig);
}

function ensureProjectTaskState(projectConfig, globalConfig) {
  const projectDir = globalConfig && globalConfig.taskRepoPath
    ? getProjectTaskDir(globalConfig, projectConfig)
    : path.join(process.cwd(), AI_DIR, projectConfig.projectId);

  ensureDir(projectDir);
  const sessionsDir = path.join(projectDir, "sessions");
  ensureDir(sessionsDir);

  const metaPath = path.join(projectDir, "project-meta.json");
  const tasksPath = path.join(projectDir, "tasks.json");
  const tasksMdPath = path.join(projectDir, "tasks.md");
  const tasksDir = path.join(projectDir, "tasks");
  const summaryPath = path.join(projectDir, "latest-summary.md");
  const promptPath = path.join(projectDir, "resume-prompt.txt");
  const currentTaskPath = path.join(projectDir, "current-task.md");
  const currentTaskPromptPath = path.join(projectDir, "current-task-prompt.txt");
  const contextPath = path.join(projectDir, "context.md");
  const handoffPath = path.join(projectDir, "handoff.md");
  ensureDir(tasksDir);

  if (!fs.existsSync(contextPath) && fs.existsSync(path.join(process.cwd(), "AI_CONTEXT.md"))) {
    fs.writeFileSync(contextPath, readFileIfExists(path.join(process.cwd(), "AI_CONTEXT.md")) + "\n", "utf8");
  }
  if (!fs.existsSync(handoffPath) && fs.existsSync(path.join(process.cwd(), "HANDOFF.md"))) {
    fs.writeFileSync(handoffPath, readFileIfExists(path.join(process.cwd(), "HANDOFF.md")) + "\n", "utf8");
  }

  const meta = readJsonIfExists(metaPath) || {
    project: projectConfig.projectId,
    repo: projectConfig.repoUrl,
    branch: projectConfig.defaultBranch || "main",
    commit: "",
    updated_at: "",
    current_focus_task_id: "",
    last_session_id: "",
    active_task_ids: []
  };

  const tasks = readJsonIfExists(tasksPath) || { tasks: [] };

  if (!fs.existsSync(tasksMdPath)) {
    fs.writeFileSync(tasksMdPath, renderTasksMarkdown(tasks), "utf8");
  }
  if (!fs.existsSync(summaryPath)) {
    fs.writeFileSync(summaryPath, "# Latest Summary\n\nRun `ai-task save` to generate this file.\n", "utf8");
  }
  if (!fs.existsSync(promptPath)) {
    fs.writeFileSync(promptPath, buildPromptV2(null), "utf8");
  }

  writeJson(metaPath, meta);
  writeJson(tasksPath, tasks);

  return {
    projectDir,
    sessionsDir,
    tasksDir,
    metaPath,
    tasksPath,
    tasksMdPath,
    summaryPath,
    promptPath,
    currentTaskPath,
    currentTaskPromptPath,
    contextPath,
    handoffPath,
    meta,
    tasks
  };
}

function persistTaskState(state) {
  state.meta.active_task_ids = state.tasks.tasks.filter((task) => !isClosedStatus(task.status)).map((task) => task.id);
  writeJson(state.tasksPath, state.tasks);
  writeJson(state.metaPath, state.meta);
  fs.writeFileSync(state.tasksMdPath, renderTasksMarkdown(state.tasks), "utf8");
  generateTaskArtifacts(state);
  syncLocalArtifacts(state);
}

function syncLocalArtifacts(state) {
  ensureDir(path.join(process.cwd(), AI_DIR));
  if (fs.existsSync(state.summaryPath)) {
    fs.writeFileSync(path.join(process.cwd(), SUMMARY_FILE), fs.readFileSync(state.summaryPath, "utf8"), "utf8");
  }
  if (fs.existsSync(state.promptPath)) {
    fs.writeFileSync(path.join(process.cwd(), PROMPT_FILE), fs.readFileSync(state.promptPath, "utf8"), "utf8");
  }
  if (fs.existsSync(state.tasksMdPath)) {
    fs.writeFileSync(path.join(process.cwd(), LOCAL_TASKS_FILE), fs.readFileSync(state.tasksMdPath, "utf8"), "utf8");
  }
  if (fs.existsSync(state.currentTaskPath)) {
    fs.writeFileSync(path.join(process.cwd(), LOCAL_CURRENT_TASK_FILE), fs.readFileSync(state.currentTaskPath, "utf8"), "utf8");
  }
  if (fs.existsSync(state.currentTaskPromptPath)) {
    fs.writeFileSync(path.join(process.cwd(), LOCAL_CURRENT_TASK_PROMPT_FILE), fs.readFileSync(state.currentTaskPromptPath, "utf8"), "utf8");
  }
}

function collectRepoState(projectConfig) {
  return {
    branch: safeGit("branch --show-current") || projectConfig.defaultBranch || "main",
    commit: safeGit("rev-parse --short HEAD") || "uncommitted",
    status: safeGit("status --short") || "Clean working tree",
    recentLog: safeGit("log --oneline -n 5") || "No commits found"
  };
}

function buildSummaryV2(projectConfig, globalConfig, meta, repoState, focusTask, openTasks, note) {
  const lines = [
    "# Latest Summary",
    "",
    `- Project: ${projectConfig.projectId}`,
    `- Repo: ${projectConfig.repoUrl || "(not set)"}`,
    `- Branch: ${repoState.branch}`,
    `- Commit: ${repoState.commit}`,
    `- Updated At: ${meta.updated_at}`,
    `- Task Repo: ${globalConfig.taskRepoUrl || globalConfig.handoffRepoUrl || "(not configured)"}`,
    "",
    "## Current Focus",
    ""
  ];

  if (focusTask) {
    lines.push(`${focusTask.id} ${focusTask.title}`);
  } else {
    lines.push("No focus task is set.");
  }

  lines.push("", "## Next Action", "");
  lines.push(focusTask && focusTask.next_action ? focusTask.next_action : "Set a focus task and next action.");

  if (note) {
    lines.push("", "## Recent Session", "", note);
  }

  lines.push("", "## Other Open Tasks", "");
  const otherTasks = openTasks.filter((task) => !focusTask || task.id !== focusTask.id);
  if (otherTasks.length) {
    for (const task of otherTasks) {
      lines.push(`- ${task.id} ${task.title} [${task.status}] [${task.priority}]`);
    }
  } else {
    lines.push("- No other open tasks.");
  }

  lines.push("", "## Working Tree", "", "```text", repoState.status, "```");
  lines.push("", "## Recent Commits", "", "```text", repoState.recentLog, "```");

  return lines.join("\n");
}

function buildPromptV2(focusTask) {
  return [
    "Please read `.ai/latest-summary.md` first, then review `.ai/current-task.md` and `.ai/current-task-prompt.txt`.",
    "Start by summarizing:",
    "1. the current focus task,",
    "2. the next concrete action,",
    "3. any other open high-priority tasks.",
    focusTask ? `Then continue ${focusTask.id} without refactoring unrelated parts.` : "Then continue the current focus task without refactoring unrelated parts."
  ].join("\n");
}

function buildSessionMarkdown(session, focusTask, openTasks) {
  const lines = [
    `# Session ${session.id}`,
    "",
    `- Created At: ${session.created_at}`,
    `- Branch: ${session.branch}`,
    `- Commit: ${session.commit}`,
    `- Focus Task: ${session.current_focus_task_id || "(none)"}`,
    ""
  ];

  if (session.note) {
    lines.push("## Session Note", "", session.note, "");
  }

  lines.push("## Focus Task", "");
  lines.push(focusTask ? `${focusTask.id} ${focusTask.title}` : "No focus task is set.");
  lines.push("", "## Open Tasks", "");
  if (openTasks.length) {
    for (const task of openTasks) {
      lines.push(`- ${task.id} ${task.title} [${task.status}] [${task.priority}]`);
    }
  } else {
    lines.push("- No open tasks.");
  }

  lines.push("", "## Git Status", "", "```text", session.git_status, "```");
  return lines.join("\n");
}

function generateTaskArtifacts(state) {
  for (const task of state.tasks.tasks) {
    fs.writeFileSync(path.join(state.tasksDir, `${task.id}.md`), renderTaskMarkdown(task, state), "utf8");
    fs.writeFileSync(path.join(state.tasksDir, `${task.id}-prompt.txt`), buildTaskPrompt(task, state), "utf8");
  }

  const focusTask = findTaskById(state.tasks, state.meta.current_focus_task_id);
  if (focusTask) {
    fs.writeFileSync(state.currentTaskPath, renderTaskMarkdown(focusTask, state), "utf8");
    fs.writeFileSync(state.currentTaskPromptPath, buildTaskPrompt(focusTask, state), "utf8");
  } else {
    fs.writeFileSync(state.currentTaskPath, "# Current Task\n\nNo focus task is set.\n", "utf8");
    fs.writeFileSync(state.currentTaskPromptPath, "No focus task is set. Choose a task before continuing.\n", "utf8");
  }
}

function renderTaskMarkdown(task, state) {
  const lines = [
    `# ${task.id} ${task.title}`,
    "",
    `- Status: ${task.status}`,
    `- Priority: ${task.priority}`,
    `- Category: ${task.category}`,
    `- Updated At: ${task.updated_at}`,
    `- Focus Task: ${state.meta.current_focus_task_id === task.id ? "yes" : "no"}`,
    "",
    "## Next Action",
    "",
    task.next_action || "No next action recorded.",
    ""
  ];

  if (task.related_files && task.related_files.length) {
    lines.push("## Related Files", "");
    for (const relatedFile of task.related_files) {
      lines.push(`- ${relatedFile}`);
    }
    lines.push("");
  }

  if (task.notes && task.notes.length) {
    lines.push("## Notes", "");
    for (const note of task.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildTaskPrompt(task, state) {
  const lines = [
    `Current task: ${task.id} ${task.title}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Category: ${task.category}`,
    `Next action: ${task.next_action || "No next action recorded."}`
  ];

  if (task.related_files && task.related_files.length) {
    lines.push(`Related files: ${task.related_files.join(", ")}`);
  }

  if (task.notes && task.notes.length) {
    lines.push(`Notes: ${task.notes.join(" | ")}`);
  }

  lines.push("Before editing, summarize the current task, the next concrete action, and any constraints.");
  lines.push("Do not refactor unrelated parts.");

  if (state.meta.current_focus_task_id === task.id) {
    lines.push(`This is the current focus task. Continue ${task.id} first.`);
  }

  return lines.join("\n");
}

function renderTasksMarkdown(tasksDoc) {
  const groups = {
    in_progress: [],
    todo: [],
    blocked: [],
    done: [],
    dropped: []
  };

  for (const task of tasksDoc.tasks) {
    (groups[task.status] || groups.todo).push(task);
  }

  const lines = ["# Tasks", ""];
  for (const status of ["in_progress", "todo", "blocked", "done", "dropped"]) {
    lines.push(`## ${formatStatusLabel(status)}`, "");
    if (!groups[status].length) {
      lines.push("- None", "");
      continue;
    }
    for (const task of groups[status]) {
      lines.push(`- ${task.id} ${task.title} [${task.priority}]`);
      if (task.next_action) {
        lines.push(`  next: ${task.next_action}`);
      }
      if (task.related_files && task.related_files.length) {
        lines.push(`  files: ${task.related_files.join(", ")}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function updateTaskFields(task, args) {
  const title = readArgValue(args, "--title");
  const status = readArgValue(args, "--status");
  const priority = readArgValue(args, "--priority");
  const category = readArgValue(args, "--category");
  const nextAction = readArgValue(args, "--next-action");
  const files = readArgValue(args, "--files");
  const note = readArgValue(args, "--note");

  if (title) task.title = title;
  if (status) task.status = normalizeStatus(status);
  if (priority) task.priority = normalizePriority(priority);
  if (category) task.category = category;
  if (nextAction) task.next_action = nextAction;
  if (files) task.related_files = parseListArg(files);
  if (note) {
    task.notes = task.notes || [];
    task.notes.push(note);
  }
}

function nextTaskId(tasksDoc) {
  const nextNumber = tasksDoc.tasks
    .map((task) => Number(String(task.id || "").replace("TASK-", "")))
    .filter((value) => !Number.isNaN(value))
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `TASK-${String(nextNumber).padStart(3, "0")}`;
}

function getProjectTaskDir(globalConfig, projectConfig) {
  return path.join(globalConfig.taskRepoPath, projectConfig.projectId);
}

function requireTask(tasksDoc, taskId) {
  const task = findTaskById(tasksDoc, taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function findTaskById(tasksDoc, taskId) {
  return tasksDoc.tasks.find((task) => task.id === taskId);
}

function normalizeStatus(status) {
  if (!TASK_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  return status;
}

function normalizePriority(priority) {
  if (!TASK_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority: ${priority}`);
  }
  return priority;
}

function parseListArg(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isClosedStatus(status) {
  return status === "done" || status === "dropped";
}

function formatStatusLabel(status) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSessionId() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function hasAnyArgs(args) {
  return Array.isArray(args) && args.length > 0;
}

function ensureGitRepo(dir) {
  if (!fs.existsSync(path.join(dir, ".git"))) {
    throw new Error(`${dir} is not a git repository`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureFile(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

function readGlobalConfigOptional() {
  return readJsonIfExists(GLOBAL_CONFIG_FILE);
}

function readRequiredGlobalConfig() {
  const config = readJsonIfExists(GLOBAL_CONFIG_FILE);
  if (!config) {
    throw new Error("Global config not found. Run `ai-task config` first.");
  }
  if (!config.taskRepoPath && config.handoffRepoPath) {
    config.taskRepoPath = config.handoffRepoPath;
  }
  if (!config.taskRepoUrl && config.handoffRepoUrl) {
    config.taskRepoUrl = config.handoffRepoUrl;
  }
  if (!config.taskRepoPath) {
    throw new Error("Global config is missing taskRepoPath.");
  }
  return config;
}

function readRequiredProjectConfig() {
  const config = readJsonIfExists(path.join(process.cwd(), PROJECT_CONFIG_FILE));
  if (!config) {
    throw new Error("Project config not found. Run `ai-task init` first.");
  }
  if (!config.projectId) {
    throw new Error("Project config is missing projectId.");
  }
  return config;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8").trim();
}

function safeGit(args) {
  try {
    return cp.execSync(`git ${args}`, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function safeGitInRepo(repoPath, args) {
  try {
    return cp.execSync(`git ${args}`, {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function runGit(repoPath, args) {
  cp.execSync(`git ${args}`, {
    cwd: repoPath,
    stdio: "inherit"
  });
}

function quote(text) {
  return JSON.stringify(text);
}

function readArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return "";
  }
  return args[index + 1];
}

async function promptMany(definitions) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answers = {};
  for (const definition of definitions) {
    const suffix = definition.defaultValue ? ` [${definition.defaultValue}]` : "";
    const answer = await ask(rl, `${definition.label}${suffix}: `);
    answers[definition.key] = answer.trim() || definition.defaultValue;
  }

  rl.close();
  return answers;
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}
