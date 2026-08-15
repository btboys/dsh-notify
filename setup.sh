#!/bin/bash

# DSH Notify Plugin Setup Script
# Usage: bash setup.sh

set -e

GREEN='\033[0;32m'
NC='\033[0m'

# Get the plugin directory (where this script is located)
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_CONFIG_DIR="$HOME/.dsh"

echo "🚀 DSH Notify Plugin Setup"
echo "📁 Plugin: $PLUGIN_DIR"
echo ""

# Check if compiled
if [ ! -f "$PLUGIN_DIR/lib/index.js" ]; then
    echo "📦 Building plugin..."
    cd "$PLUGIN_DIR"
    npm install
    npm run build
fi

echo -e "${GREEN}✓${NC} Plugin ready"

# Run validation
echo ""
echo "🔍 Running tests..."
cd "$PLUGIN_DIR"
node test/validate.mjs

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Configure notifications: ~/.dsh/notify.config.yml"
echo ""
echo "2. Add to your DSH agent preset:"
echo "   - id: notify"
echo "     name: '@dsh/plugin-notify'"
echo "     path: $PLUGIN_DIR"
echo ""
echo "3. Restart DSH"
echo ""
