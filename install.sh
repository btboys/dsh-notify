#!/bin/bash

# DSH Notify Plugin Installation Script
# Usage: bash install.sh
#
# Since 1.0.16 this package declares `dsh.bundle` metadata, so it is installed
# as an activatable DSH plugin bundle (host plane), which also makes it appear
# in `dsh plugin` / the Web Plugin Market instead of the
# "该包未声明 dsh 元数据，不会在启动时加载" warning.

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

# Register as a DSH plugin bundle in the web (host) profile when `dsh` is
# available. Fall back to documenting a manual patch layer otherwise.
if command -v dsh >/dev/null 2>&1; then
    echo ""
    echo "Registering plugin bundle into the web profile..."
    dsh plugin --profile web add "$PLUGIN_DIR" \
        || echo -e "${YELLOW}⚠${NC} Could not auto-register; add it manually:"
    echo "   dsh plugin --profile web add dsh-notify-plugin"
else
    echo ""
    echo -e "${YELLOW}⚠${NC} 'dsh' CLI not found. Register the bundle manually:"
    echo "   dsh plugin --profile web add dsh-notify-plugin"
fi

# Run validation
echo ""
node "$PLUGIN_DIR/test/validate.mjs"

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Restart / refresh DSH Web, then verify the notify plugin loaded under"
echo "   Settings → 插件配置 (it requires the 'notify' namespace in the apiproxy"
echo "   WEB_SETTINGS_NAMESPACES allowlist to be editable)."
echo ""
