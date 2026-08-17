# dsh-notify-plugin

[![npm version](https://img.shields.io/npm/v/dsh-notify-plugin)](https://www.npmjs.com/package/dsh-notify-plugin)
[![GitHub release](https://img.shields.io/github/v/release/btboys/dsh-notify)](https://github.com/btboys/dsh-notify/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

DeepSeek Harness (DSH) 通知插件，支持多种通知渠道，在**对话完成、暂停、失败、向你提问、需要授权或确认**时自动发送通知。

## ✨ 功能特性

- 🖥️ **系统通知** - 桌面原生通知，支持自定义提示音（macOS 声音名 / 自定义音频文件 / 按事件类型区分）
- 🔗 **Webhook 通知** - 自定义 HTTP webhook，支持任意 endpoint
- 💼 **企业微信机器人** - 企业微信群机器人通知，支持 markdown 格式
- ✈️ **Telegram 机器人** - Telegram Bot API 通知，支持 HTML / MarkdownV2 富文本
- 📝 **丰富内容** - 通知包含工作区名、对话标题、用户问题、助手回复摘要、使用工具、轮次与耗时
- ❓ **提问提醒** - Agent 通过 `ask_user_question` 提问时立即通知
- 🔐 **授权提醒** - Agent 请求沙箱权限提升时立即通知
- 🎯 **事件过滤** - 按事件类型选择性启用/禁用通知
- ⚙️ **灵活配置** - 支持 YAML/JSON 配置文件和运行时配置
- 🔌 **Cordis 集成** - 完美融入 DSH 的 Cordis 插件系统

## 📦 安装

### 方式一：DSH Bundle 安装（推荐）

本包从 `1.0.16` 起声明了 DSH 元数据（`dsh.bundle`），会作为**插件 bundle** 被 DSH 识别并在启动时自动加载，而不再只是普通依赖（否则 DSH 会提示"该包未声明 dsh 元数据，不会在启动时加载"）。

```bash
dsh plugin --profile web add dsh-notify-plugin
```

然后重启或刷新 DSH Web，插件即被挂载到 host 平面。

### 方式二：从 NPM 安装

```bash
npm install dsh-notify-plugin
```

再以 bundle 方式加入 profile：

```bash
dsh plugin --profile web add ./node_modules/dsh-notify-plugin
```

### 方式三：GitHub 快速安装

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
bash install.sh
```

安装脚本会自动完成依赖安装、编译和配置。

### 方式四：手动安装（源码编译）

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

依赖项：
- `axios` - HTTP 请求（webhook / 企业微信 / Telegram）
- 系统通知基于 macOS 原生 `osascript`（无额外依赖）

## 🚀 快速开始

### 1. 以 bundle 方式安装到 host 平面

> ⚠️ 必须在 **host 平面**（web profile）挂载，而不是 agent preset。Host 挂载才能注册 settings 命名空间并正确监听 `session/event`。

```bash
dsh plugin --profile web add dsh-notify-plugin
```

该命令会识别包内的 `dsh.bundle`（`cordis.patch.yml`），把插件加入 profile 的 bundle 层，并在启动时自动加载。也可通过 Web 的 **插件市场** 一键安装。

如果你希望手动管理 patch 层，可编辑 `~/.dsh/profiles/web/cordis.patch.yml` 引入本包提供的补丁：

```yaml
- insert:
    - id: notify
      name: dsh-notify-plugin
      config:
        enabled: true
        channels:
          system:
            enabled: true
            sound: true
          wecom:
            enabled: true
            webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
            msgType: markdown
            mentions:
              - '@all'
        events:
          conversationCompleted: true
          conversationFailed: true
          authorizationRequired: true
```

> 📌 **关键要点**：
> - 顶层必须是 `- insert:` 包裹（PatchOptions 格式），不能直接写 entry
> - 通过 bundle 安装时，`name` 用包名 `dsh-notify-plugin`（Node ESM 模块解析定位到 `lib/index.js`）
> - 若手动用绝对路径挂载源码，`name` 改用 `/绝对/路径/到/dsh-notify/lib/index.js`

### 2. 重启 DSH

```
Ctrl+C 停止 → dsh web 重启
```

重新加载配置后，插件会自动监听 DSH 事件并发送通知。运行一个对话即可验证。

## ⚙️ 配置选项

### 完整配置示例 (YAML)

```yaml
enabled: true

channels:
  # 桌面系统通知
  system:
    enabled: true
    sound: true                   # 播放提示音
    soundName: Glass              # 可选：macOS 系统声音名（Glass/Ping/Sosumi/Basso 等）
    soundFile: /path/to/alert.wav # 可选：自定义音频文件（优先级高于 soundName）
    sounds:                       # 可选：按事件类型指定 macOS 声音名（优先级最高）
      conversationFailed: Basso
      conversationCompleted: Glass
    icon: /path/to/icon.png       # 可选：自定义图标
  
  # Webhook 通知
  webhook:
    enabled: false
    url: https://your-endpoint.com/notify
    method: POST             # HTTP 方法
    timeout: 5000            # 超时时间（毫秒）
    headers:                 # 自定义请求头
      Authorization: Bearer your-token
  
  # 企业微信机器人
  wecom:
    enabled: false
    webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
    msgType: markdown        # 消息类型：markdown 或 text
    mentions:                # 要提及的用户
      - '@all'
      # - user_id_1
      # - user_id_2

  # Telegram 机器人
  telegram:
    enabled: false
    botToken: '123456:ABC-DEF...'  # @BotFather 创建的机器人 token
    chatId: '123456789'            # 目标聊天 ID（用户或群组）
    parseMode: HTML                # 解析模式：HTML | MarkdownV2 | text
    disableNotification: false     # 静默发送（接收端不响铃）

# 事件过滤器
events:
  conversationCompleted: true      # 对话完成
  conversationPaused: true         # 对话暂停
  conversationFailed: true         # 对话失败
  authorizationRequired: true      # 需要授权
  confirmationRequired: true       # 需要确认

# 通知标题前缀（默认空，不加前缀；可设为如 '[MyApp]' 来统一加上产品标签）
titlePrefix: ''
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用整个插件 |
| `channels.system.enabled` | boolean | `true` | 启用系统通知 |
| `channels.system.sound` | boolean | `true` | 播放提示音 |
| `channels.system.soundName` | string | `''` | macOS 系统声音名（如 `Glass`、`Ping`、`Sosumi`） |
| `channels.system.soundFile` | string | `''` | 自定义音频文件路径（经 `afplay` 播放） |
| `channels.system.sounds` | object | `{}` | 按事件类型指定 macOS 声音名 |
| `channels.webhook.enabled` | boolean | `false` | 启用 webhook 通知 |
| `channels.webhook.url` | string | `''` | Webhook URL（必需） |
| `channels.wecom.enabled` | boolean | `false` | 启用企业微信通知 |
| `channels.wecom.webhookUrl` | string | `''` | 企业微信 webhook URL（必需） |
| `channels.wecom.msgType` | string | `'markdown'` | 消息类型：`markdown` 或 `text` |
| `channels.telegram.enabled` | boolean | `false` | 启用 Telegram 通知 |
| `channels.telegram.botToken` | string | `''` | Telegram 机器人 token（必需） |
| `channels.telegram.chatId` | string | `''` | 目标聊天 ID（必需） |
| `channels.telegram.parseMode` | string | `'HTML'` | 解析模式：`HTML`、`MarkdownV2` 或 `text` |
| `channels.telegram.disableNotification` | boolean | `false` | 静默发送 |
| `events.*` | boolean | `true` | 各事件类型的开关 |
| `titlePrefix` | string | `''` | 所有通知标题的前缀（默认不加） |

## 🎯 支持的事件类型

| 事件 | 通知标题 | 触发场景 |
|------|---------|----------|
| `conversationCompleted` | `✅ [工作区] 对话完成` | Agent 成功完成任务（`turn/end` reason=completed） |
| `conversationPaused` | `⏸️ [工作区] 对话暂停` | Agent 被中断 / 等待输入（`turn/end` reason=aborted/blocked） |
| `conversationFailed` | `❌ [工作区] 对话失败` | Agent 遇到错误（`turn/end` reason=error） |
| `confirmationRequired` | `❓ [工作区] 需要回答` | Agent 通过 `ask_user_question` 向你提问 |
| `authorizationRequired` | `🔐 [工作区] 需要授权` | Agent 请求沙箱权限提升（`approval/asked`） |

### 丰富内容示例

系统通知正文会自动提取对话上下文，例如：

```
💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
🔧 工具: bash×2, read
📊 第 2 轮 · 2 步 · 60s · 📝 开发通知插件 · 📁 notify
```

- 💬 用户最后的问题
- 🤖 助手回复摘要
- 🔧 使用的工具（含次数）
- 📊 轮次、步数、耗时、对话标题、工作区

## 💻 编程式使用

在你的自定义插件中使用通知服务：

```typescript
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from 'dsh-notify-plugin'

export default function myPlugin(ctx: Context) {
  // 注册 notify 插件
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true },
    },
  })
  
  // 发送通知
  ctx.on('my/custom-event', async (data) => {
    await ctx.notify.send({
      type: 'conversationCompleted',
      title: 'Custom Event',
      message: 'Something happened!',
      metadata: { data },
    })
  })
  
  // 或使用便捷方法
  await ctx.notify.notifyConversationCompleted(
    'Task Done',
    'Your task has been completed'
  )
  
  await ctx.notify.notifyConversationFailed(
    'Error Occurred',
    'Something went wrong',
    { error: 'Details here' }
  )
}
```

## 🔔 企业微信机器人设置

1. 在企业微信群中添加机器人
2. 获取 Webhook URL（格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`）
3. 在配置中填入 URL
4. 可选：配置 `mentions` 来提醒特定成员

### Markdown 消息格式示例

企业微信通知会自动格式化为美观的 markdown：

```markdown
## ✅ [notify] 对话完成

💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
🔧 工具: bash×2, read
📊 第 2 轮 · 2 步 · 60s · 📝 开发通知插件
```

## ✈️ Telegram 机器人设置

1. 在 Telegram 中与 [@BotFather](https://t.me/BotFather) 对话，发送 `/newbot` 创建机器人，复制得到的 token（格式 `123456:ABC-DEF...`）
2. 与你的机器人开始聊天（或把它加进一个群组）
3. 获取 chat ID：
   - 简单方式：给机器人发一条消息，然后访问 `https://api.telegram.org/bot<你的token>/getUpdates`，返回 JSON 中的 `message.chat.id` 即为你需要的 ID
   - 或在 Telegram 中 @userinfobot 获取
4. 在配置中填入 `botToken` 和 `chatId`，将 `enabled` 设为 `true`

### Telegram 消息格式示例

默认使用 HTML 解析模式，通知会格式化为富文本：

```html
<b>✅ [notify] 对话完成</b>

💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
🔧 工具: bash×2, read
📊 第 2 轮 · 2 步 · 60s · 📝 开发通知插件
```

> 💡 `parseMode` 可选 `HTML`（推荐，转义简单）、`MarkdownV2`（需完整转义）或 `text`（纯文本）。

## 🔗 Webhook Payload 格式

Webhook 会收到以下 JSON payload：

```json
{
  "type": "conversationCompleted",
  "title": "✅ [notify] 对话完成",
  "message": "💬 帮我读一下当前目录…\n🤖 目录里有 src、lib、test…",
  "metadata": {
    "workspace": "notify",
    "title": "开发通知插件",
    "tools": ["bash", "read"],
    "turn": 2,
    "durationMs": 60000
  },
  "timestamp": 1705312225000
}
```

## 🖥️ 在 Web 配置通知（设置 → 通知）

`dsh-notify-plugin` 会在 DSH Web 的 **设置** 侧边栏注册一个与「通用设置」「模型」「插件」同级的一级入口 **「通知」**（与 dsh-pocket 的「手机访问」同款入口形态），在那里可配置启用开关、系统 / Webhook / 企业微信 / Telegram 渠道、触发事件与标题前缀。

配置页的读写走 **loopback RPC 通道**：

1. **host 端**（`src/notify-rpc.ts` + `src/index.ts`）用 `ctx.connection.rpc.handle` 注册 `/dsh-notify` 逻辑通道，处理 `notify.config.get/set`；写入时更新运行中的 `NotifyService` 并持久化到 `$DSH_HOME/notify/config.json`，重启后自动合并生效。
2. **client 端**（`src/client/`，tsdown 构建为 `client/client.js`）注册 `settings.section`（id `notify`），页面通过 `ctx.connection.rpc.call` 读写配置——不依赖 `settingsScope`，也不依赖 DSH 内部 settings 命名空间注入。
3. 以 bundle 方式在 host 平面挂载：

   ```bash
   dsh plugin --profile web add dsh-notify-plugin
   ```

完成后重启 / 刷新 DSH Web，打开 **设置 → 通知**，即可看到并编辑全部配置。

> 💡 页面为**全量保存**：点击「保存」会把当前草稿整体写回并持久化，重启后仍生效。残留的 `notify` settings 命名空间注册（`src/settings.ts`）保留以便兼容读取该命名空间的消费者，本配置页不再依赖它。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 构建（host `lib/` + 浏览器端 `client/client.js`）
npm run build

# 仅构建浏览器端 client bundle
npm run build:client

# 类型检查（host + client）
npm run typecheck

# 开发模式（host 监听变化）
npm run dev

# 集成测试（验证 settings 注册）
node test/integration.mjs

# 配置持久化 + RPC 通道单元测试
node --experimental-transform-types test/persist.mjs
```

## 📝 示例

查看 `examples/` 目录获取更多配置和使用示例：

- `notify.config.example.yml` - YAML 配置示例
- `notify.config.example.json` - JSON 配置示例
- `dsh-agent-preset.example.yml` - DSH preset 集成示例
- `usage-example.ts` - 编程式使用示例

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT
