# @dsh/plugin-notify

[![GitHub release](https://img.shields.io/github/v/release/btboys/dsh-notify)](https://github.com/btboys/dsh-notify/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

DeepSeek Harness (DSH) 通知插件，支持多种通知渠道，在对话完成、暂停、失败、需要授权或确认时自动发送通知。

## ✨ 功能特性

- 🖥️ **系统通知** - 桌面原生通知（macOS Notification Center / Windows Toast / Linux notify-osd），支持自定义提示音（macOS 声音名 / 自定义音频文件 / 按事件类型区分）
- 🔗 **Webhook 通知** - 自定义 HTTP webhook，支持任意 endpoint
- 💼 **企业微信机器人** - 企业微信群机器人通知，支持 markdown 格式
- ✈️ **Telegram 机器人** - Telegram Bot API 通知，支持 HTML / MarkdownV2 富文本
- 🎯 **事件过滤** - 按事件类型选择性启用/禁用通知
- ⚙️ **灵活配置** - 支持 YAML/JSON 配置文件和运行时配置
- 🔌 **Cordis 集成** - 完美融入 DSH 的 Cordis 插件系统

## 📦 安装

### 方式一：快速安装（推荐）

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
bash install.sh
```

安装脚本会自动完成依赖安装、编译和配置。

### 方式二：手动安装

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

依赖项：
- `axios` - HTTP 请求（webhook / 企业微信 / Telegram）
- 系统通知基于 macOS 原生 `osascript`（无需额外依赖）

## 🚀 快速开始

### 1. 在 DSH Agent Preset 中启用

创建或编辑你的 agent preset 配置文件（例如 `~/.dsh/presets/my-agent.cordis.yml`）：

```yaml
- id: notify
  name: '@dsh/plugin-notify'
  path: ~/.dsh/plugins/dsh-notify
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

### 2. 重启 DSH

重新加载配置后，插件会自动监听 DSH 事件并发送通知。

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

# 通知标题前缀
titlePrefix: '[DSH]'
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用整个插件 |
| `channels.system.enabled` | boolean | `true` | 启用系统通知 |
| `channels.system.sound` | boolean | `true` | 播放提示音 |
| `channels.system.soundName` | string | `''` | macOS 系统声音名（如 `Glass`、`Ping`、`Sosumi`） |
| `channels.system.soundFile` | string | `''` | 自定义音频文件路径（经 `afplay` 播放，优先级高于 `soundName`） |
| `channels.system.sounds` | object | `{}` | 按事件类型指定 macOS 声音名（优先级最高） |
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
| `titlePrefix` | string | `'[DSH]'` | 所有通知标题的前缀 |

## 🎯 支持的事件类型

| 事件 | 描述 | 触发场景 |
|------|------|----------|
| `conversationCompleted` | 对话正常完成 | Agent 成功完成任务 |
| `conversationPaused` | 对话暂停 | 用户主动暂停或等待输入 |
| `conversationFailed` | 对话失败 | Agent 遇到错误或异常 |
| `authorizationRequired` | 需要授权 | Agent 请求沙箱权限提升 |
| `confirmationRequired` | 需要确认 | Agent 需要用户确认操作 |

## 💻 编程式使用

在你的自定义插件中使用通知服务：

```typescript
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from '@dsh/plugin-notify'

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
## [DSH] Agent Task Completed

The code generation task has been finished successfully.

**类型**: ✅ 对话完成
**时间**: 2024/1/15 14:30:25

**详细信息**:
- taskId: abc123
- duration: 5m 30s
- filesModified: 3
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
<b>🔔 [DSH] Agent Task Completed</b>

The code generation task has been finished successfully.

类型: ✅ 对话完成
时间: 2024/1/15 14:30:25

<b>详细信息</b>:
- taskId: abc123
- duration: 5m 30s
```

> 💡 `parseMode` 可选 `HTML`（推荐，转义简单）、`MarkdownV2`（需完整转义）或 `text`（纯文本）。

## 🔗 Webhook Payload 格式

Webhook 会收到以下 JSON payload：

```json
{
  "type": "conversationCompleted",
  "title": "[DSH] Task Finished",
  "message": "Your task has been completed",
  "metadata": {
    "taskId": "abc123",
    "duration": "5m 30s"
  },
  "timestamp": 1705312225000
}
```

## 🖥️ 在 Web "插件配置" 页面注册

DSH Web 界面有「插件配置」页面，可以在浏览器中编辑插件配置。要让 notify 插件出现在那里，需要三步：

### 1. 插件代码注册 settings 命名空间（已完成 ✅）

插件已内置 `ctx.settings.register('notify', schema)` 逻辑（见 `src/settings.ts`），导出 `NOTIFY_SETTINGS_NAMESPACE` 和 `NOTIFY_SETTINGS_SCHEMA`。

### 2. 在 host 平面挂载插件（不是 agent preset）

编辑 `~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- id: notify
  name: '/绝对/路径/到/dsh-notify'
  config:
    enabled: true
    channels:
      system:
        enabled: true
        sound: true
    events:
      conversationCompleted: true
      conversationFailed: true
      authorizationRequired: true
```

> ⚠️ agent preset 挂载的插件无法注册 settings 命名空间（host 平面才可以）。

### 3. 将命名空间加入 apiproxy 白名单

修改 `packages/host/apiproxy/src/api-proxy.ts` 中的 `WEB_SETTINGS_NAMESPACES`，加入 `'notify'`：

```ts
const WEB_SETTINGS_NAMESPACES = [
  'agent-loop', 'shell', 'locale', 'permission', 'ui-conversation', 'ui-theme', 'web-search-deepseek', 'notify',
] as const
```

> 这是当前 DSH 的机制：暴露名单是 host 的决定，而不是插件自声明。未来版本可能支持插件自我暴露（deferred work）。

完成后重启 DSH，打开 Web → 设置 → 插件配置，即可看到 notify 卡片并编辑。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式（监听变化）
npm run dev

# 集成测试（验证 settings 注册）
node test/integration.mjs
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
