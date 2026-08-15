# 📦 发布到 NPM 指南

## 步骤 1: 登录 NPM

```bash
npm login
```

按照提示输入：
- 用户名
- 密码
- 邮箱
- 验证码（如果启用了 2FA）

## 步骤 2: 验证登录状态

```bash
npm whoami
```

应该显示你的 npm 用户名。

## 步骤 3: 构建项目

```bash
cd /Users/gson/Documents/deepseek/notify
npm run build
```

## 步骤 4: 发布到 NPM

```bash
npm publish
```

如果这是第一次发布 scoped 包（@dsh/plugin-notify），需要：

```bash
npm publish --access public
```

## 步骤 5: 验证发布

```bash
npm view @dsh/plugin-notify
```

---

## 📋 发布前检查清单

- ✅ package.json 配置正确
- ✅ 版本号正确 (1.0.0)
- ✅ 构建成功
- ✅ 登录 npm
- ✅ 测试通过

---

## 🔄 更新版本

### 补丁版本 (1.0.0 → 1.0.1)

```bash
npm version patch
npm publish
```

### 次要版本 (1.0.0 → 1.1.0)

```bash
npm version minor
npm publish
```

### 主要版本 (1.0.0 → 2.0.0)

```bash
npm version major
npm publish
```

---

## 🎯 发布后用户使用方式

### 方式一：从 npm 安装（推荐）

```bash
npm install @dsh/plugin-notify
```

### 方式二：从 GitHub 安装

```bash
git clone https://github.com/btboys/dsh-notify.git ~/.dsh/plugins/dsh-notify
cd ~/.dsh/plugins/dsh-notify
npm install
npm run build
```

---

## ⚠️ 注意事项

1. **包名唯一性**：`@dsh/plugin-notify` 是 scoped 包名，需要 npm 账户有权限
2. **版本号**：遵循语义化版本控制
3. **依赖项**：确保所有依赖都已正确声明
4. **文件过滤**：`.gitignore` 会自动排除不需要的文件

---

## 🛠️ 故障排除

### Q: 提示 "You need to authorize this machine"

A: 运行 `npm login` 登录

### Q: 提示 "You must be logged in to publish packages"

A: 运行 `npm login` 登录

### Q: 提示 "Package name too similar to existing packages"

A: 修改 package.json 中的 `name` 字段

### Q: 提示 "You do not have permission to publish '@dsh/plugin-notify'"

A: 
1. 确保你有 npm 账户
2. 确保你有权限发布到 @dsh scope
3. 或者修改包名，例如：`dsh-notify` 或 `btboys-dsh-notify`

---

## 📞 支持

- GitHub: https://github.com/btboys/dsh-notify
- NPM: https://www.npmjs.com/package/@dsh/plugin-notify
