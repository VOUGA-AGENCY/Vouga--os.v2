#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/desktop/macos/build"
APP_DIR="$BUILD_DIR/Vouga OS.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$BUILD_DIR/module-cache"
xcrun swiftc "$PROJECT_ROOT/desktop/macos/main.swift" \
  -o "$APP_DIR/Contents/MacOS/VougaOS" \
  -framework AppKit -framework WebKit \
  -module-cache-path "$BUILD_DIR/module-cache"
cp "$PROJECT_ROOT/public/vouga-mark.png" "$APP_DIR/Contents/Resources/vouga-mark.png"
python3 - "$APP_DIR" <<'PY'
import plistlib,sys
from pathlib import Path
info = {
 'CFBundleName': 'Vouga OS', 'CFBundleDisplayName': 'Vouga OS',
 'CFBundleIdentifier': 'agency.vouga.os.local', 'CFBundleExecutable': 'VougaOS',
 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '0.1.0',
 'CFBundleVersion': '1', 'LSUIElement': True,
 'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
 'NSHighResolutionCapable': True,
}
(Path(sys.argv[1])/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
PY
codesign --force --deep --sign - "$APP_DIR"
printf 'Aplicação criada em: %s\n' "$APP_DIR"
