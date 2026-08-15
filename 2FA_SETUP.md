# 🔐 NPM 双因素认证（2FA）配置指南

## ⚠️ 当前状态

你的 npm 账户启用了双因素认证，发布包需要 OTP 验证码。

---

## 📋 解决方案

### 方案1：临时禁用 2FA（推荐用于首次发布）

1. 禁用 2FA：
```bash
npm profile disable-otp
```

2. 发布包：
```bash
cd /Users/gson/Documents/deepseek/notify
npm publish --access public --cache /tmp/npm-cache
```

3. 重新启用 2FA：
```bash
npm profile enable-otp
```

---

### 方案2：配置 OTP 验证器

1. 启用 OTP：
```bash
npm profile enable-otp
```

2. 扫描二维码或输入密钥到认证器应用（如 Google Authenticator）

3. 获取验证码后发布：
```bash
npm publish --access public --cache /tmp/npm-cache --otp=123456
```

---

### 方案3：使用发布脚本

```bash
cd /Users/gson/Documents/deepseek/notify
bash publish-with-otp.sh
```

脚本会提示输入 OTP 验证码。

---

## 🔍 检查当前 2FA 状态

```bash
npm profile get
```

---

## 📚 更多信息

- [npm 双因素认证文档](https://docs.npmjs.com/configuring-two-factor-authentication)
- [npm profile 命令](https://docs.npmjs.com/cli/profile)

---

## 💡 提示

- 首次发布新包时，可以临时禁用 2FA
- 发布后建议重新启用 2FA 以保护账户安全
- 如果使用 OTP，确保认证器应用时间同步
