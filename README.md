# @dsh/plugin-notify

[![GitHub release](https://img.shields.io/github/v/release/btboys/dsh-notify)](https://github.com/btboys/dsh-notify/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

DeepSeek Harness (DSH) 通知插件，支持多种通知渠道，在对话完成、暂停、失败、需要授权或确认时自动发送通知。

## ✨ 功能特性

- 🖥️ **系统通知** - 桌面原生通知（macOS Notification Center / Windows Toast / Linux notify-osd）
- 🔗 **Webhook 通知** - 自定义 HTTP webhook，支持任意 endpoint
- 💼 **企业微信机器人** - 企业微信群机器人通知，支持 markdown 格式
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
- `node-notifier` - 系统通知
- `axios` - HTTP 请求

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
    sound: true              # 播放提示音
    icon: /path/to/icon.png  # 可选：自定义图标
  
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
| `channels.webhook.enabled` | boolean | `false` | 启用 webhook 通知 |
| `channels.webhook.url` | string | `''` | Webhook URL（必需） |
| `channels.wecom.enabled` | boolean | `false` | 启用企业微信通知 |
| `channels.wecom.webhookUrl` | string | `''` | 企业微信 webhook URL（必需） |
| `channels.wecom.msgType` | string | `'markdown'` | 消息类型：`markdown` 或 `text` |
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

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式（监听变化）
npm run dev
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
