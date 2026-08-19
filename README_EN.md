# dsh-notify-plugin

[![npm version](https://img.shields.io/npm/v/dsh-notify-plugin)](https://www.npmjs.com/package/dsh-notify-plugin)
[![GitHub release](https://img.shields.io/github/v/release/btboys/dsh-notify)](https://github.com/btboys/dsh-notify/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文](./README.md) | **English**

A notification plugin for DeepSeek Harness (DSH) with multiple channels, automatically notifying you when a **conversation completes, pauses, fails, asks you a question, requests authorization/confirmation, or its TODO task list advances**.

## ✨ Features

- 🖥️ **System notifications** — native desktop notifications (macOS / Windows / Linux) with custom alert sounds (macOS sound names / custom audio files / per-event-type overrides)
- 🔗 **Webhook** — custom HTTP webhook to any endpoint
- 💼 **WeCom bot** — Enterprise WeChat group-bot notifications with markdown support
- 💬 **WeChat ClawBot** — push to your **personal WeChat** via Tencent's official iLink protocol, scan-to-login; two-way interaction (approve authorizations / answer questions / continue conversations right from WeChat)
- ✈️ **Telegram bot** — Telegram Bot API notifications with HTML / MarkdownV2 rich text; two-way interaction with **inline buttons** (approve authorizations / answer questions / continue conversations)
- 📝 **Slim content** — the notification body carries only the user's prompt and the assistant's reply summary (paragraph structure preserved, thinking/reasoning never leaked); tools/turn/duration stay in structured metadata
- ❓ **Question alerts** — instant notification when the agent asks via `ask_user_question`
- 🔐 **Authorization alerts** — instant notification when the agent requests sandbox escalation
- 📋 **TODO progress** — pushes the checklist and progress when the agent publishes/updates its task list (`todo_write`); debounced per session, only real progress changes push
- 🎯 **Event filtering** — enable/disable notifications per event type
- ⚙️ **Flexible configuration** — YAML/JSON config files plus a Web settings page with runtime persistence
- 🔌 **Cordis integration** — fits natively into DSH's Cordis plugin system

## 📦 Installation

### Option 1: DSH bundle install (recommended)

Since `1.0.16` this package declares DSH metadata (`dsh.bundle`) and is recognized as a **plugin bundle**, auto-loaded at startup (instead of being an inert plain dependency):

```bash
dsh plugin --profile web add dsh-notify-plugin
```

Then restart or refresh DSH Web — the plugin mounts on the host plane.

### Option 2: Install from NPM

```bash
npm install dsh-notify-plugin
```

Then add it as a bundle:

```bash
dsh plugin --profile web add ./node_modules/dsh-notify-plugin
```

### Option 3: Quick install from GitHub

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
bash install.sh
```

The install script handles dependencies, compilation and configuration.

### Option 4: Manual install (build from source)

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

Dependencies:
- `axios` — HTTP requests (webhook / WeCom / WeChat ClawBot / Telegram)
- `qrcode` — renders the WeChat login QR code locally in the settings page (browser bundle only)
- System notifications are **cross-platform native**, no extra dependencies:
  - macOS: `osascript` notification + `afplay` sound
  - Windows: PowerShell WinRT toast (no modules required) + system alert sound
  - Linux: `notify-send` (libnotify; headless servers get a hint to install `libnotify-bin`) + best-effort sound via `paplay`/`canberra-gtk-play`

## 🚀 Quick Start

### 1. Install as a bundle on the host plane

> ⚠️ Mount on the **host plane** (web profile), NOT in an agent preset. Host mounting is required to register the settings namespace and listen to `session/event` correctly.

```bash
dsh plugin --profile web add dsh-notify-plugin
```

This detects the package's `dsh.bundle` (`cordis.patch.yml`), adds the plugin to the profile's bundle layer and auto-loads it at startup. You can also install with one click from the Web **plugin marketplace**.

To manage the patch layer manually, edit `~/.dsh/profiles/web/cordis.patch.yml`:

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

> 📌 **Key points**:
> - The top level must be wrapped in `- insert:` (PatchOptions format); a bare entry does not work
> - With bundle installs, `name` is the package name `dsh-notify-plugin` (Node ESM resolution locates `lib/index.js`)
> - When mounting source by absolute path, use `name: /absolute/path/to/dsh-notify/lib/index.js`

### 2. Restart DSH

```
Ctrl+C to stop → dsh web to restart
```

Once reloaded, the plugin listens for DSH events and sends notifications. Run any conversation to verify.

## ⚙️ Configuration

### Full config example (YAML)

```yaml
enabled: true

channels:
  # Desktop system notifications
  system:
    enabled: true
    sound: true                   # play an alert sound
    soundName: Glass              # optional: macOS sound name (Glass/Ping/Sosumi/Basso…, macOS only)
    soundFile: /path/to/alert.wav # optional: custom audio file (beats soundName; Windows supports .wav only)
    sounds:                       # optional: per-event-type macOS sound names (highest priority)
      conversationFailed: Basso
      conversationCompleted: Glass
    icon: /path/to/icon.png       # optional: custom icon
  
  # Webhook
  webhook:
    enabled: false
    url: https://your-endpoint.com/notify
    method: POST             # HTTP method
    timeout: 5000            # timeout in milliseconds
    headers:                 # custom request headers
      Authorization: Bearer your-token
  
  # WeCom (Enterprise WeChat) group bot
  wecom:
    enabled: false
    webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
    msgType: markdown        # markdown or text
    mentions:                # users to mention
      - '@all'
      # - user_id_1
      # - user_id_2

  # WeChat ClawBot (personal WeChat, Tencent's official iLink channel)
  wechat:
    enabled: false
    toUserIds: []            # optional: restrict push targets (xxx@im.wechat); empty pushes to every user who messaged the bot
    interactive: true        # optional: two-way interaction (default true) — reply in WeChat to approve/answer/continue
    # sessionFile: /path/to/wechat-session.json  # optional: session file path (default <DSH_HOME>/notify/wechat-session.json)

  # Telegram bot
  telegram:
    enabled: false
    botToken: '123456:ABC-DEF...'  # bot token from @BotFather
    chatId: '123456789'            # target chat ID (user or group)
    parseMode: HTML                # HTML | MarkdownV2 | text
    disableNotification: false     # send silently (no sound on the receiver side)
    interactive: true              # two-way: inline buttons / replies approve, answer, continue sessions

# Event filters
events:
  conversationCompleted: true      # conversation completed
  conversationPaused: true         # conversation paused
  conversationFailed: true         # conversation failed
  authorizationRequired: true      # authorization required
  confirmationRequired: true       # confirmation/question required
  todoProgress: true               # TODO progress (task list appears or advances)

# Notification title prefix (empty by default; e.g. '[MyApp]' to tag all titles)
titlePrefix: ''
```

### Config reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the whole plugin |
| `channels.system.enabled` | boolean | `true` | Enable system notifications |
| `channels.system.sound` | boolean | `true` | Play an alert sound |
| `channels.system.soundName` | string | `''` | macOS sound name (e.g. `Glass`, `Ping`, `Sosumi`; macOS only) |
| `channels.system.soundFile` | string | `''` | Custom audio file path (macOS `afplay` / Linux `paplay`; Windows supports `.wav` only) |
| `channels.system.sounds` | object | `{}` | Per-event-type macOS sound names (macOS only) |
| `channels.webhook.enabled` | boolean | `false` | Enable webhook notifications |
| `channels.webhook.url` | string | `''` | Webhook URL (required) |
| `channels.wecom.enabled` | boolean | `false` | Enable WeCom notifications |
| `channels.wecom.webhookUrl` | string | `''` | WeCom webhook URL (required) |
| `channels.wecom.msgType` | string | `'markdown'` | Message type: `markdown` or `text` |
| `channels.wechat.enabled` | boolean | `false` | Enable WeChat ClawBot (personal WeChat) notifications |
| `channels.wechat.toUserIds` | string[] | `[]` | Restrict push targets; empty pushes to every user who messaged the bot |
| `channels.wechat.interactive` | boolean | `true` | Two-way interaction: WeChat replies approve / answer / continue sessions |
| `channels.wechat.sessionFile` | string | `''` | Session file path (default `<DSH_HOME>/notify/wechat-session.json`) |
| `channels.telegram.enabled` | boolean | `false` | Enable Telegram notifications |
| `channels.telegram.botToken` | string | `''` | Telegram bot token (required) |
| `channels.telegram.chatId` | string | `''` | Target chat ID (required) |
| `channels.telegram.parseMode` | string | `'HTML'` | Parse mode: `HTML`, `MarkdownV2` or `text` |
| `channels.telegram.disableNotification` | boolean | `false` | Send silently |
| `channels.telegram.interactive` | boolean | `true` | Two-way interaction: buttons/replies approve, answer, continue sessions |
| `events.*` | boolean | `true` | Per-event-type switches |
| `titlePrefix` | string | `''` | Prefix for all notification titles |

## 🎯 Supported Event Types

| Event | Notification title | Trigger |
|-------|-------------------|---------|
| `conversationCompleted` | `✅ [workspace] 对话完成` | Agent finished the task (`turn/end` reason=completed) |
| `conversationPaused` | `⏸️ [workspace] 对话暂停` | Agent interrupted / awaiting input (`turn/end` reason=aborted/blocked) |
| `conversationFailed` | `❌ [workspace] 对话失败` | Agent hit an error (`turn/end` reason=error) |
| `confirmationRequired` | `❓ [workspace] 需要回答` | Agent asks you via `ask_user_question` |
| `todoProgress` | `📋 [workspace] TODO 进度 2/5` | Agent publishes/updates its task list via `todo_write`; pushes only when progress changes (pure in-progress churn stays silent) |
| `authorizationRequired` | `🔐 [workspace] 需要授权` | Agent requests sandbox escalation (`approval/asked`) |

### Notification content example

The body is a slim user-prompt + assistant-reply pair (paragraph structure preserved, reply capped at 500 characters, thinking/reasoning never included):

```
💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
```

- 💬 the user's last question (host-injected context blocks are filtered out automatically)
- 🤖 the assistant's last reply summary

A TODO progress push is a status-icon checklist plus a completion count (lists beyond 10 items are folded):

```
📊 进度: 2/5 已完成
✅ 设计推送格式
✅ 实现 service 推送逻辑
🔄 更新设置页与文案
⬜ 更新 README
⬜ 构建验证
```

Structured data (tools used, turn count, duration, conversation title, workspace) stays in `metadata` for programmatic channels such as webhooks.

## 💻 Programmatic Usage

Use the notification service from your own plugin:

```typescript
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from 'dsh-notify-plugin'

export default function myPlugin(ctx: Context) {
  // Register the notify plugin
  await ctx.plugin(notifyPlugin, {
    enabled: true,
    channels: {
      system: { enabled: true },
    },
  })
  
  // Send a notification
  ctx.on('my/custom-event', async (data) => {
    await ctx.notify.send({
      type: 'conversationCompleted',
      title: 'Custom Event',
      message: 'Something happened!',
      metadata: { data },
    })
  })
  
  // Or use the convenience methods
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

## 🔔 WeCom Bot Setup

1. Add a bot to a WeCom group
2. Copy the webhook URL (format: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`)
3. Fill the URL into the config
4. Optional: configure `mentions` to ping specific members

### Markdown message example

WeCom notifications are formatted as clean markdown:

```markdown
## ✅ [notify] 对话完成

💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
```

## 💬 WeChat ClawBot Setup (personal WeChat)

WeChat ClawBot is Tencent's official personal-WeChat bot channel (iLink protocol, `ilinkai.weixin.qq.com`). Unlike third-party reverse-engineered clients, it is **official and compliant, with no account-ban risk**.

1. Enable `channels.wechat.enabled` in the settings page (or config file)
2. The settings page's "微信 (ClawBot)" section shows a login QR code — **scan it with WeChat and confirm**
3. After login, **send the ClawBot one message in WeChat** (any content) — iLink proactive pushes must carry a `context_token` captured from an inbound message; without this step the bot cannot reach you
4. Notifications then push to your WeChat

Notes:

- Credentials and context tokens persist in `<DSH_HOME>/notify/wechat-session.json` (mode 0600)
- **Context tokens are ephemeral**: iLink `context_token`s are not guaranteed to survive restarts or long gaps. On failure (`ret=-2`) the adapter evicts the dead token and logs a hint — **if pushes stop after a DSH restart, just message the bot once to recover**
- When the login session expires (`ret=-14`) the adapter automatically returns to the QR login flow and the settings page shows a fresh QR code; the "重新登录" button resets manually
- By default pushes go to every user who messaged the bot; `toUserIds` restricts targets
- Messages are plain text (iLink text items), auto-truncated to 2000 characters

### Two-way interaction (`channels.wechat.interactive`, on by default)

With interaction enabled, WeChat does not just receive notifications — it **drives DSH**:

- 🔐 **Approve authorizations** — when the agent requests sandbox escalation you get "🔐 需要授权"; reply **Y** to approve / **N** to reject
- ❓ **Answer questions** — `ask_user_question` prompts arrive with numbered options; reply with the **option number** (space-separated for multi-select) or **free text**
- 💬 **Continue the conversation** — with nothing pending, any text reply is injected as the next user message into the **most recently notified session**, queued for execution
- 📱 **Switch conversation/workspace** — send `/sessions` to list recent conversations or `/workspace` to list workspaces (numbered menus), then reply `/sel s <n>` / `/sel w <n>` to switch the continuation target; `/current` shows the current one (same vocabulary as the Telegram command menu)

Interaction runs on the DSH host's in-process API gateway (`ctx.apiProxy`) and shares one pending table with the Web UI: WeChat and the browser race — **first answer wins**, and the other side's prompt auto-dismisses. The `toUserIds` allowlist also gates interaction: replies from non-allowlisted users are ignored (an empty allowlist lets every known user interact).

Config example:

```yaml
channels:
  wechat:
    enabled: true
    interactive: true        # two-way interaction (default true)
    toUserIds: []            # push + interaction allowlist
```

## ✈️ Telegram Bot Setup

1. Talk to [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, and copy the token (format `123456:ABC-DEF...`)
2. Start a chat with your bot (or add it to a group)
3. Get the chat ID:
   - Easy way: send the bot a message, then visit `https://api.telegram.org/bot<your-token>/getUpdates` — `message.chat.id` in the JSON is your ID (positive for private chats, **negative for groups** — copy the minus sign too)
   - Or ask @userinfobot in Telegram
4. Fill `botToken` and `chatId` into the config and set `enabled: true`

### Push capabilities

- Three parse modes: `HTML` (default, recommended), `MarkdownV2`, `text`
- `disableNotification: true` sends silently (no sound on the receiver side)
- Slim body: title + 💬 user prompt + 🤖 assistant reply summary

### Two-way interaction (`channels.telegram.interactive`, on by default)

Telegram is the **best interaction experience** of all channels — the Bot API natively supports inline buttons, and there is no ephemeral context-token problem like WeChat iLink (the chatId alone suffices to push, and it survives restarts):

- 🔐 **Approve authorizations** — sandbox escalation requests arrive as a **button card**:

  ```
  🔐 需要授权（session prefix…）

  🔧 操作: bash
  📝 原因: 需要提升沙箱权限以写入主目录

  [ ✅ 批准 ]  [ ❌ 拒绝 ]
  ```

  Tap a button or reply **Y**/**N**; the keyboard clears immediately after a tap, preventing double-submits

- ❓ **Answer questions** — a single question with options arrives with **option buttons** (tap to answer); multi-question batches, multi-select, or free-text questions are answered by replying with the **option number or text**
- 💬 **Continue the conversation** — with nothing pending, any text reply is injected into the **most recently notified session** as the next user message, queued for execution
- 📱 **Command menu** — the chat's menu button (registered via `setMyCommands`) offers slash commands; tap buttons to switch, no memorizing needed:

  | Command | Effect |
  |---|---|
  | `/sessions` | Inline buttons list recent conversations (title + workspace; blank sessions and subagents filtered) — tap to switch the continuation target |
  | `/workspace` | Inline buttons list workspaces — tapping reuses the workspace's latest conversation, or creates a fresh one when it has none |
  | `/current` | Show the current continuation target |
  | `/help` | Command help |

  Works on WeChat too: send the same commands as text; menus arrive as numbered lists and `/sel s <n>` / `/sel w <n>` completes the pick

Mechanics and safety:

- Runs on the DSH host's in-process API gateway (`ctx.apiProxy`), sharing one pending table with the Web UI: Telegram / WeChat / browser race — **first answer wins**, the rest auto-dismiss
- **Only the configured `chatId` may drive interactions** — a natural allowlist; messages and button taps from anyone else are ignored
- Every action gets a receipt message ("✅ 已批准", "📨 已发送到会话"), so outcomes are always visible

> ⚠️ If the bot previously had a webhook configured, `getUpdates` long-polling conflicts with HTTP 409 — call `https://api.telegram.org/bot<token>/deleteWebhook` first (the logs point this out explicitly).

### Telegram message format example

HTML parse mode (default) renders notifications as rich text:

```html
<b>✅ [notify] 对话完成</b>

💬 帮我读一下当前目录，看看项目结构
🤖 目录里有 src、lib、test 等目录…
```

> 💡 `parseMode` may be `HTML` (recommended, simple escaping), `MarkdownV2` (requires full escaping), or `text` (plain).

## 🔗 Webhook Payload Format

Webhooks receive this JSON payload:

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

## 🖥️ Configure in the Web UI (Settings → 通知)

`dsh-notify-plugin` registers a top-level **「通知」** entry in the DSH Web **Settings** sidebar (same level as "通用设置" / "模型" / "插件", same shape as dsh-pocket's "手机访问"), where you can configure the master switch, the system / webhook / WeCom / WeChat (ClawBot) / Telegram channels, event filters and the title prefix. The WeChat section embeds a scan-to-login panel (QR rendered locally, no third-party service) with live login status.

The settings page reads/writes over a **loopback RPC channel**:

1. **Host side** (`src/notify-rpc.ts` + `src/index.ts`) registers the `/dsh-notify` logical channel with `ctx.connection.rpc.handle`, serving `notify.config.get/set`; writes update the running `NotifyService` and persist to `$DSH_HOME/notify/config.json`, auto-merged on restart.
2. **Client side** (`src/client/`, built by tsdown into `client/client.js`) registers `settings.section` (id `notify`); the page reads/writes config via `ctx.connection.rpc.call` — independent of `settingsScope` and of DSH's internal settings namespace injection.
3. Mount as a bundle on the host plane:

   ```bash
   dsh plugin --profile web add dsh-notify-plugin
   ```

Then restart / refresh DSH Web and open **Settings → 通知** to see and edit everything.

> 💡 The page **saves in full**: clicking "保存" writes back the entire draft and persists it across restarts. The leftover `notify` settings-namespace registration (`src/settings.ts`) remains for consumers that read that namespace; the settings page itself no longer depends on it.

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build (host `lib/` + browser `client/client.js`)
npm run build

# Build only the browser client bundle
npm run build:client

# Type check (host + client)
npm run typecheck

# Dev mode (host watch)
npm run dev

# Integration test (settings registration)
node test/integration.mjs

# Config persistence + RPC channel unit tests
node --experimental-transform-types test/persist.mjs
```

## 📝 Examples

See the `examples/` directory for more configuration and usage examples:

- `notify.config.example.yml` — YAML config example
- `notify.config.example.json` — JSON config example
- `dsh-agent-preset.example.yml` — DSH preset integration example
- `usage-example.ts` — programmatic usage example

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT
