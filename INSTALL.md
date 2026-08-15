# 安装说明

DSH Notify Plugin 支持多种安装方式。

## 🚀 快速安装（推荐）

### 1. 克隆仓库

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
```

### 2. 运行安装脚本

```bash
bash install.sh
```

安装脚本会自动：
- 安装 npm 依赖
- 编译插件
- 创建配置文件
- 运行验证测试

### 3. 添加到 DSH 配置

编辑你的 DSH agent preset 文件（如 `~/.dsh/presets/standard.yml`），添加：

```yaml
- id: notify
  name: '@dsh/plugin-notify'
  path: ~/.dsh/plugins/dsh-notify
  configPath: ~/.dsh/notify.config.yml
```

### 4. 重启 DSH

```bash
# 重启 DSH 以加载插件
dsh restart
```

---

## 📦 手动安装

如果不想使用安装脚本，可以手动完成：

### 1. 克隆并编译

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

### 2. 创建配置文件

创建 `~/.dsh/notify.config.yml`：

```yaml
enabled: true
channels:
  system:
    enabled: true
    sound: true
  webhook:
    enabled: false
    url: ""
  wecom:
    enabled: false
    webhookUrl: ""
events:
  conversationCompleted: true
  conversationPaused: true
  conversationFailed: true
  authorizationRequired: true
  confirmationRequired: true
titlePrefix: "[DSH]"
```

### 3. 添加到 DSH

在你的 agent preset 中添加插件配置。

---

## 🔍 验证安装

```bash
cd ~/.dsh/plugins/dsh-notify
node test/validate.mjs
```

应该看到所有测试通过。

---

## ⚙️ 配置说明

### 通知渠道

| 渠道 | 说明 | 配置项 |
|------|------|--------|
| 系统通知 | 桌面原生通知 | `channels.system` |
| Webhook | 自定义 HTTP endpoint | `channels.webhook` |
| 企业微信 | 企业微信群机器人 | `channels.wecom` |

### 事件类型

| 事件 | 说明 | 默认启用 |
|------|------|----------|
| `conversationCompleted` | 对话完成 | ✅ |
| `conversationPaused` | 对话暂停 | ✅ |
| `conversationFailed` | 对话失败 | ✅ |
| `authorizationRequired` | 需要授权 | ✅ |
| `confirmationRequired` | 需要确认 | ✅ |

---

## 💼 企业微信配置

1. 打开企业微信群 → 群设置 → 添加机器人
2. 复制 Webhook URL（格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`）
3. 编辑 `~/.dsh/notify.config.yml`：

```yaml
wecom:
  enabled: true
  webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的KEY"
  msgType: markdown
  mentions:
    - '@all'
```

---

## 📖 文档

- **README.md** - 完整使用文档
- **QUICKSTART.md** - 5分钟快速开始
- **PROJECT_SUMMARY.md** - 项目技术总结
- **examples/** - 配置示例

---

## ❓ 常见问题

### Q: macOS 上没有收到系统通知？

A: 检查 系统偏好设置 → 通知与焦点，确保 Node.js 或 Terminal 有通知权限。

### Q: 如何禁用特定事件的通知？

A: 在配置中将对应事件设置为 `false`：
```yaml
events:
  conversationPaused: false
  confirmationRequired: false
```

### Q: 如何自定义通知标题前缀？

A: 修改配置中的 `titlePrefix`：
```yaml
titlePrefix: "[MyApp]"
```

### Q: 插件在哪里查找配置文件？

A: 插件按以下顺序查找配置：
1. `configPath` 指定的路径
2. `~/.dsh/notify.config.yml`
3. `~/.dsh/notify.config.json`
4. 当前目录的 `dsh-notify.config.yml`

---

## 🛠️ 故障排除

1. 确保插件已正确编译（`lib/index.js` 存在）
2. 检查 DSH 日志输出
3. 确保配置文件格式正确
4. 运行验证测试：`node test/validate.mjs`

---

## 📞 支持

- GitHub: https://github.com/btboys/dsh-notify
- Issues: https://github.com/btboys/dsh-notify/issues
