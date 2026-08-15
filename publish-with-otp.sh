#!/bin/bash

# NPM Publish Script with OTP Support
# Usage: bash publish-with-otp.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "📦 DSH Notify Plugin - NPM Publisher"
echo ""

# Check if logged in
echo "🔍 Checking npm login..."
NPM_USER=$(npm whoami --cache /tmp/npm-cache 2>/dev/null)

if [ -z "$NPM_USER" ]; then
    echo -e "${RED}❌ Not logged in to npm${NC}"
    echo "   Please run 'npm login' first"
    exit 1
fi

echo -e "${GREEN}✓${NC} Logged in as: $NPM_USER"
echo ""

# Build project
echo "🔨 Building project..."
npm run build
echo -e "${GREEN}✓${NC} Build successful"
echo ""

# Run tests
echo "🧪 Running tests..."
node test/validate.mjs
echo -e "${GREEN}✓${NC} Tests passed"
echo ""

# Get version
VERSION=$(node -p "require('./package.json').version")
echo "📌 Version: $VERSION"
echo ""

# Get OTP from user
echo -e "${YELLOW}🔐 双因素认证需要一次性密码 (OTP)${NC}"
echo ""
read -p "   请输入 OTP 验证码: " OTP

if [ -z "$OTP" ]; then
    echo -e "${RED}❌ OTP 不能为空${NC}"
    exit 1
fi

echo ""
echo "📤 Publishing to npm..."
npm publish --access public --cache /tmp/npm-cache --otp="$OTP"

echo ""
echo -e "${GREEN}✅ 成功发布 @dsh/plugin-notify@$VERSION${NC}"
echo ""
echo "📦 NPM Package: https://www.npmjs.com/package/@dsh/plugin-notify"
echo ""
echo "📝 用户安装方式:"
echo "   npm install @dsh/plugin-notify"
echo ""

# Create git tag
echo "🏷️  Creating git tag..."
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main --tags 2>/dev/null || echo "⚠️  Git push failed (may need manual push)"

echo ""
echo -e "${GREEN}🎉 发布完成！${NC}"
