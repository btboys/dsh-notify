#!/bin/bash

# DSH Notify Plugin Installation Script
# Usage: bash install.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get the plugin directory (where this script is located)
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_CONFIG_DIR="$HOME/.dsh"

echo "🚀 Installing DSH Notify Plugin..."
echo "📁 Plugin location: $PLUGIN_DIR"
echo ""

# Install dependencies and build
cd "$PLUGIN_DIR"
npm install
npm run build

echo -e "${GREEN}✓${NC} Plugin built successfully"

# Create config directory
mkdir -p "$DSH_CONFIG_DIR/presets"

# Create notification config
CONFIG_FILE="$DSH_CONFIG_DIR/notify.config.yml"
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << 'EOF'
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
EOF
    echo -e "${GREEN}✓${NC} Created config at $CONFIG_FILE"
else
    echo -e "${YELLOW}⚠${NC} Config already exists at $CONFIG_FILE"
fi

# Create preset
cat > "$DSH_CONFIG_DIR/presets/notify.yml" << EOF
- id: notify
  name: '@dsh/plugin-notify'
  path: $PLUGIN_DIR
  configPath: $CONFIG_FILE
EOF

echo -e "${GREEN}✓${NC} Created preset"

# Run validation
echo ""
node "$PLUGIN_DIR/test/validate.mjs"

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Add to your DSH agent preset:"
echo ""
echo "   - id: notify"
echo "     name: '@dsh/plugin-notify'"
echo "     path: $PLUGIN_DIR"
echo "     configPath: $CONFIG_FILE"
echo ""
