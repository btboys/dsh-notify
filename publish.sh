#!/bin/bash

# NPM Publish Script for DSH Notify Plugin
# Usage: bash publish.sh [patch|minor|major]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "📦 DSH Notify Plugin - NPM Publisher"
echo ""

# Check if logged in to npm
echo "🔍 Checking npm login status..."
if ! npm whoami > /dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to npm${NC}"
    echo "   Please run 'npm login' first"
    exit 1
fi

NPM_USER=$(npm whoami)
echo -e "${GREEN}✓${NC} Logged in as: $NPM_USER"
echo ""

# Build the project
echo "🔨 Building project..."
npm run build
echo -e "${GREEN}✓${NC} Build successful"
echo ""

# Run validation tests
echo "🧪 Running tests..."
node test/validate.mjs
echo -e "${GREEN}✓${NC} Tests passed"
echo ""

# Get version bump type
VERSION_TYPE=${1:-patch}

if [[ "$VERSION_TYPE" != "patch" && "$VERSION_TYPE" != "minor" && "$VERSION_TYPE" != "major" ]]; then
    echo -e "${RED}❌ Invalid version type: $VERSION_TYPE${NC}"
    echo "   Usage: bash publish.sh [patch|minor|major]"
    echo "   - patch: 1.0.0 -> 1.0.1 (bug fixes)"
    echo "   - minor: 1.0.0 -> 1.1.0 (new features)"
    echo "   - major: 1.0.0 -> 2.0.0 (breaking changes)"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 Current version: $CURRENT_VERSION"

# Bump version
echo "⬆️  Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓${NC} Version bumped: $CURRENT_VERSION -> $NEW_VERSION"
echo ""

# Show package info
echo "📋 Package info:"
echo "   Name: @dsh/plugin-notify"
echo "   Version: $NEW_VERSION"
echo "   Registry: https://registry.npmjs.org/"
echo ""

# Confirm publish
echo -e "${YELLOW}⚠️  Ready to publish to npm${NC}"
read -p "   Continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publish cancelled"
    # Revert version bump
    git checkout -- package.json package-lock.json 2>/dev/null || true
    exit 1
fi

# Publish to npm
echo ""
echo "📤 Publishing to npm..."
npm publish --access public

echo ""
echo -e "${GREEN}✅ Successfully published @dsh/plugin-notify@$NEW_VERSION${NC}"
echo ""
echo "📦 NPM Package: https://www.npmjs.com/package/@dsh/plugin-notify"
echo "📊 Version: $NEW_VERSION"
echo ""
echo "📝 Users can now install with:"
echo "   npm install @dsh/plugin-notify"
echo ""

# Create git tag
echo "🏷️  Creating git tag..."
git add package.json package-lock.json
git commit -m "Release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
git push origin main --tags 2>/dev/null || echo "⚠️  Could not push to git (manual push may be needed)"

echo ""
echo -e "${GREEN}🎉 Release complete!${NC}"
echo ""
