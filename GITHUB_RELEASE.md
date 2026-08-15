# 🎉 DSH Notify Plugin 已成功发布到 GitHub！

## 📦 仓库地址

**https://github.com/btboys/dsh-notify**

---

## 🚀 快速安装（3步完成）

### 步骤 1: 克隆仓库

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
```

### 步骤 2: 运行安装脚本

```bash
cd ~/.dsh/plugins/dsh-notify
bash install.sh
```

安装脚本会自动：
- ✅ 安装 npm 依赖
- ✅ 编译 TypeScript 代码
- ✅ 创建配置文件 `~/.dsh/notify.config.yml`
- ✅ 运行验证测试

### 步骤 3: 添加到 DSH 配置

编辑你的 DSH agent preset 文件（如 `~/.dsh/presets/standard.yml`），添加：

```yaml
- id: notify
  name: '@dsh/plugin-notify'
  path: ~/.dsh/plugins/dsh-notify
  configPath: ~/.dsh/notify.config.yml
```

然后重启 DSH 即可。

---

## ⚙️ 配置通知渠道

编辑 `~/.dsh/notify.config.yml` 文件：

### 启用系统通知（默认开启）

```yaml
channels:
  system:
    enabled: true
    sound: true
```

### 启用企业微信通知

1. 打开企业微信群 → 群设置 → 添加机器人
2. 复制 Webhook URL
3. 编辑配置文件：

```yaml
channels:
  wecom:
    enabled: true
    webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的KEY"
    msgType: markdown
    mentions:
      - '@all'
```

### 启用 Webhook 通知

```yaml
channels:
  webhook:
    enabled: true
    url: "https://your-webhook-endpoint.com/notify"
    method: POST
    headers:
      Authorization: "Bearer your-token"
```

---

## 🎯 支持的事件类型

| 事件 | 描述 | 默认 |
|------|------|------|
| `conversationCompleted` | 对话完成 | ✅ |
| `conversationPaused` | 对话暂停 | ✅ |
| `conversationFailed` | 对话失败 | ✅ |
| `authorizationRequired` | 需要授权 | ✅ |
| `confirmationRequired` | 需要确认 | ✅ |

---

## 📖 文档

| 文件 | 说明 |
|------|------|
| [README.md](README.md) | 完整使用文档 |
| [INSTALL.md](INSTALL.md) | 详细安装说明 |
| [QUICKSTART.md](QUICKSTART.md) | 5分钟快速开始 |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | 项目技术总结 |
| [examples/](examples/) | 配置示例 |

---

## 🔍 验证安装

```bash
cd ~/.dsh/plugins/dsh-notify
node test/validate.mjs
```

应该看到所有测试通过。

---

## 🛠️ 开发相关

### 项目结构

```
dsh-notify/
├── src/                      # TypeScript 源代码
│   ├── index.ts             # 插件入口
│   ├── service.ts           # 核心服务
│   ├── types.ts             # 类型定义
│   └── adapters/            # 通知适配器
├── examples/                 # 配置示例
├── test/                     # 测试脚本
├── install.sh               # 安装脚本
├── setup.sh                 # 设置脚本
└── README.md                # 文档
```

### 开发命令

```bash
# 安装依赖
npm install

# 编译
npm run build

# 开发模式（监听变化）
npm run dev

# 运行测试
node test/validate.mjs
```

---

## ❓ 常见问题

### Q: macOS 上没有收到系统通知？

A: 检查 系统偏好设置 → 通知与焦点，确保 Node.js 或 Terminal 有通知权限。

### Q: 如何禁用特定事件？

A: 编辑 `~/.dsh/notify.config.yml`：
```yaml
events:
  conversationPaused: false
  confirmationRequired: false
```

### Q: 如何自定义通知前缀？

A: 编辑配置文件：
```yaml
titlePrefix: "[MyApp]"
```

---

## 📞 支持

- **GitHub**: https://github.com/btboys/dsh-notify
- **Issues**: https://github.com/btboys/dsh-notify/issues

---

## 🎊 总结

✅ 插件已成功发布到 GitHub  
✅ 包含完整的安装脚本  
✅ 支持 3 种通知渠道  
✅ 支持 5 种事件类型  
✅ 完整的文档和示例  
✅ 验证测试套件  

**立即使用：**
```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
bash install.sh
```
