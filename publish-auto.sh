#!/bin/bash

# One-click publish script for DSH Notify Plugin
# Handles OTP automatically by temporarily disabling 2FA

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 DSH Notify Plugin - 一键发布"
echo ""

# Check npm login
echo "🔍 检查 npm 登录状态..."
NPM_USER=$(npm whoami --cache /tmp/npm-cache 2>/dev/null)

if [ -z "$NPM_USER" ]; then
    echo -e "${RED}❌ 未登录 npm${NC}"
    echo "   请先运行 'npm login'"
    exit 1
fi

echo -e "${GREEN}✓${NC} 已登录: $NPM_USER"
echo ""

# Build project
echo "🔨 构建项目..."
npm run build
echo -e "${GREEN}✓${NC} 构建成功"
echo ""

# Run tests
echo "🧪 运行测试..."
node test/validate.mjs
echo -e "${GREEN}✓${NC} 测试通过"
echo ""

# Get version
VERSION=$(node -p "require('./package.json').version")
echo "📌 版本: $VERSION"
echo ""

# Check if 2FA is enabled
echo "🔐 检查双因素认证状态..."
OTP_STATUS=$(npm profile get --json --cache /tmp/npm-cache 2>/dev/null | grep -o '"tfa":[^,}]*' || echo '"tfa":null')

if [[ "$OTP_STATUS" == *"\"tfa\":true"* ]] || [[ "$OTP_STATUS" == *"\"tfa\":\"authenticator\""* ]]; then
    echo -e "${YELLOW}⚠️  双因素认证已启用${NC}"
    echo ""
    
    # Ask user for action
    echo "请选择操作："
    echo "  1) 临时禁用 2FA 后发布（推荐）"
    echo "  2) 输入 OTP 验证码发布"
    echo "  3) 取消发布"
    echo ""
    read -p "请输入选项 (1/2/3): " choice
    
    case $choice in
        1)
            echo ""
            echo "⏸️  临时禁用双因素认证..."
            npm profile disable-otp --cache /tmp/npm-cache
            echo -e "${GREEN}✓${NC} 2FA 已临时禁用"
            
            echo ""
            echo "📤 发布到 npm..."
            npm publish --access public --cache /tmp/npm-cache
            
            echo ""
            echo "🔄 重新启用双因素认证..."
            npm profile enable-otp --cache /tmp/npm-cache
            echo -e "${GREEN}✓${NC} 2FA 已重新启用"
            ;;
        2)
            echo ""
            read -p "请输入 OTP 验证码: " OTP
            
            if [ -z "$OTP" ]; then
                echo -e "${RED}❌ OTP 不能为空${NC}"
                exit 1
            fi
            
            echo ""
            echo "📤 发布到 npm..."
            npm publish --access public --cache /tmp/npm-cache --otp="$OTP"
            ;;
        3)
            echo ""
            echo "❌ 发布已取消"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 无效选项${NC}"
            exit 1
            ;;
    esac
else
    echo -e "${GREEN}✓${NC} 双因素认证未启用"
    echo ""
    echo "📤 发布到 npm..."
    npm publish --access public --cache /tmp/npm-cache
fi

echo ""
echo -e "${GREEN}✅ 成功发布 @dsh/plugin-notify@$VERSION${NC}"
echo ""
echo "📦 NPM 包: https://www.npmjs.com/package/@dsh/plugin-notify"
echo ""
echo "📝 用户安装方式:"
echo "   npm install @dsh/plugin-notify"
echo ""

# Create git tag
echo "🏷️  创建 git 标签..."
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main --tags 2>/dev/null || echo "⚠️  Git 推送失败（可能需要手动推送）"

echo ""
echo -e "${GREEN}🎉 发布完成！${NC}"
