# 快速开始指南

## 5分钟快速集成到 DSH

### 步骤 1: 克隆并安装插件

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

### 步骤 2: 配置企业微信机器人（可选）

1. 打开企业微信，进入目标群聊
2. 点击群设置 → 添加机器人
3. 复制 Webhook URL（格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`）

### 步骤 3: 创建配置文件

创建 `~/.dsh/notify.config.yml`：

```yaml
enabled: true

channels:
  # 桌面通知（推荐开启）
  system:
    enabled: true
    sound: true
  
  # 企业微信（可选）
  wecom:
    enabled: true
    webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY_HERE
    msgType: markdown
    mentions:
      - '@all'

events:
  conversationCompleted: true
  conversationFailed: true
  authorizationRequired: true
```

### 步骤 4: 在 DSH Agent Preset 中启用

编辑你的 agent preset 文件（如 `~/.dsh/presets/my-agent.cordis.yml`），添加：

```yaml
- id: notify
  name: '@dsh/plugin-notify'
  path: ~/.dsh/plugins/dsh-notify
  configPath: ~/.dsh/notify.config.yml
```

或者直接在 preset 中配置：

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
    events:
      conversationCompleted: true
      conversationFailed: true
      authorizationRequired: true
```

### 步骤 5: 重启 DSH

重新启动 DSH，插件会自动加载并开始监听事件。

## 测试通知

### 方法 1: 触发实际事件

让 DSH agent 执行一个任务，当任务完成、失败或需要授权时，你会收到通知。

### 方法 2: 运行验证测试

```bash
cd ~/.dsh/plugins/dsh-notify
node test/validate.mjs
```

应该看到所有测试通过。

### 方法 3: 手动发送测试通知

创建一个测试脚本 `test-notify.mjs`：

```javascript
import { Context } from '@deepseek-ai/cordis'
import notifyPlugin from '@dsh/plugin-notify'

const ctx = new Context()

await ctx.plugin(notifyPlugin, {
  enabled: true,
  channels: {
    system: { enabled: true, sound: true },
  },
})

await ctx.notify.send({
  type: 'conversationCompleted',
  title: '测试通知',
  message: '这是一条测试通知',
})

await ctx.fiber.dispose()
```

运行：
```bash
node test-notify.mjs
```

## 常见问题

### Q: 没有收到系统通知？

A: macOS 首次使用可能需要授权：
1. 打开"系统偏好设置" → "通知与焦点"
2. 找到 Node.js 或相关应用
3. 允许通知

### Q: 企业微信通知发送失败？

A: 检查：
1. Webhook URL 是否正确
2. 机器人是否在群聊中
3. 网络连接是否正常

### Q: 如何只接收特定事件的通知？

A: 在配置中禁用不需要的事件：

```yaml
events:
  conversationCompleted: true   # 只接收完成通知
  conversationPaused: false
  conversationFailed: true      # 和失败通知
  authorizationRequired: false
  confirmationRequired: false
```

### Q: 如何在代码中使用？

A: 参考 `examples/usage-example.ts`

## 下一步

- 查看完整文档：[README.md](README.md)
- 查看更多示例：[examples/](examples/)
- 查看项目总结：[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
