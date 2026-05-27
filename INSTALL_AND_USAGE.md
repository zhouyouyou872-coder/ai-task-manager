# AI Task Manager 安装与使用文档

## 1. 工具组成

AI Task Manager 由两部分组成：

- `CLI`
  - 命令行执行层
  - 负责任务数据读写、焦点任务切换、任务提示词生成、任务同步

- `Skill`
  - 自然语言交互层
  - 负责把“当前有哪些任务”“去做某个任务”“把某个任务标记为完成”这类人话映射成底层任务操作

完整使用时，建议同时安装 `CLI` 和 `Skill`。

## 2. 获取代码

仓库地址：

```text
https://github.com/zhouyouyou872-coder/ai-task-manager
```

先将仓库 clone 到本地。

## 3. 安装 CLI

进入 CLI 目录：

```powershell
cd ai-task-manager\packages\cli
```

安装命令：

```powershell
npm.cmd link
```

如果本机的 `npm` 命令本身可用，也可以使用：

```powershell
npm link
```

安装完成后验证：

```powershell
ai-task --help
```

## 4. 安装 Skill

Skill 目录位于：

```text
skills/ai-task-manager
```

用户需要根据自己实际使用的 AI 工具，将该 Skill 安装到对应工具的 Skill 目录或适配目录中。

说明：

- 如果更换 AI 工具，只需要重新安装 Skill
- CLI 不需要因为更换 AI 工具而重装

## 5. 准备任务数据仓库

每个用户需要准备一个自己的任务数据仓库，用来存放：

- 任务池
- 当前焦点任务
- 当前任务提示词
- 项目摘要
- 会话快照

例如：

- 远程仓库地址：
  `https://github.com/<your-name>/ai-task-center`
- 本地路径：
  `D:\code\ai-task-center`

将该仓库 clone 到本地后，在每台机器上执行一次：

```powershell
ai-task config --repo-url "https://github.com/<your-name>/ai-task-center" --repo-path "D:\code\ai-task-center" --branch main
```

这一步是全局配置，每台设备只需要做一次。

## 6. 在业务项目中初始化

进入需要接入任务管理的业务仓库，例如：

```powershell
cd D:\code\my-project
```

执行初始化：

```powershell
ai-task init --project-id my-project --repo-url "https://github.com/<your-name>/my-project.git" --branch main
```

初始化后，项目中会建立项目级配置和本地 AI 上下文文件。

## 7. 常用 CLI 命令

### 7.1 查看当前任务

```powershell
ai-task task list
```

### 7.2 新增任务

```powershell
ai-task task add --title "修复登录页错误" --priority high --category bug --next-action "检查表单提交逻辑"
```

### 7.3 切换焦点任务

```powershell
ai-task task focus TASK-001
```

### 7.4 查看当前任务上下文

```powershell
ai-task current
```

### 7.5 更新任务状态

```powershell
ai-task task update TASK-001 --status in_progress --next-action "补充错误日志定位"
```

### 7.6 标记任务完成

```powershell
ai-task task done TASK-001 --note "登录页问题已修复"
```

### 7.7 标记任务阻塞

```powershell
ai-task task block TASK-002 --note "依赖后端接口返回字段确认"
```

### 7.8 保存当前进度

```powershell
ai-task save --note "今天完成了登录页问题定位，下一步处理错误提示"
```

### 7.9 同步任务数据

```powershell
ai-task sync
```

## 8. 通过 Skill 使用

安装 Skill 后，用户不需要记住全部 CLI 命令，可以直接使用自然语言。

例如：

- `当前有哪些任务`
- `去做登录页那个 bug`
- `继续当前任务`
- `把这个任务标记为完成`
- `保存当前任务进度`

推荐规则：

- “去做某个任务”时，先切焦点任务，再读取当前任务上下文
- “继续当前任务”时，优先读取当前任务提示词
- “完成某个任务”后，及时确认下一个焦点任务

## 9. 推荐日常工作流

### 9.1 开始工作前

```powershell
ai-task task list
ai-task task focus TASK-001
ai-task current
```

### 9.2 开发过程中

- 如果发现新问题，则新增任务
- 如果任务状态发生变化，则更新任务状态
- 始终围绕当前焦点任务工作

### 9.3 开发结束时

```powershell
ai-task save --note "今天做了什么，下一步做什么"
ai-task sync
```

## 10. 换设备时如何继续使用

在新设备上：

1. clone `ai-task-manager`
2. 安装 CLI
3. 安装 Skill
4. clone 任务数据仓库
5. 执行 `ai-task config`
6. clone 业务仓库
7. 在业务仓库里继续使用 `ai-task`

如果业务仓库已经初始化过，一般不需要重新执行 `ai-task init`，除非项目级配置文件不存在。

## 11. 最短上手流程

如果只保留最小必要步骤，可以按下面执行：

```powershell
cd ai-task-manager\packages\cli
npm.cmd link

ai-task config --repo-url "https://github.com/<your-name>/ai-task-center" --repo-path "D:\code\ai-task-center" --branch main

cd D:\code\my-project
ai-task init --project-id my-project --repo-url "https://github.com/<your-name>/my-project.git" --branch main

ai-task task list
ai-task task add --title "我的第一个任务" --priority medium --category feature --next-action "明确下一步动作"
ai-task task focus TASK-001
ai-task current
ai-task save --note "初始化任务管理"
ai-task sync
```

## 12. 总结

AI Task Manager 的核心目标不是保存会话，而是维护项目任务状态和 AI 所需的任务上下文。

只要任务池、焦点任务和当前任务上下文持续保持更新，AI 就可以在跨设备、跨会话、跨工具的场景下继续围绕任务稳定工作。
