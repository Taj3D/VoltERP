#!/bin/bash
# Helper to test a module page
# Usage: ./test_module.sh <button_text> <screenshot_name> [<parent_tab_text>]
set -e

BUTTON_TEXT="$1"
SCREENSHOT_NAME="$2"
PARENT_TAB="$3"  # optional: e.g. "Core Config", "Structure", "Configuration"

# Optional: click parent tab first
if [ -n "$PARENT_TAB" ]; then
  REF=$(agent-browser snapshot -i 2>&1 | grep -E "^- button \"$PARENT_TAB\"" | grep -oE '\[ref=e[0-9]+\]' | head -1 | sed 's/\[ref=//;s/\]//')
  if [ -n "$REF" ]; then
    echo "Clicking parent tab '$PARENT_TAB' ($REF)"
    agent-browser click "@$REF" >/dev/null 2>&1 || true
    sleep 1
  fi
fi

# Get fresh ref for the target button
REF=$(agent-browser snapshot -i 2>&1 | grep -E "^- button \"$BUTTON_TEXT\"" | grep -oE '\[ref=e[0-9]+\]' | head -1 | sed 's/\[ref=//;s/\]//')

if [ -z "$REF" ]; then
  echo "❌ Button '$BUTTON_TEXT' not found in sidebar"
  exit 1
fi

echo "Clicking '$BUTTON_TEXT' ($REF)"
agent-browser click "@$REF" 2>&1 | tail -1
sleep 3

# Take screenshot
agent-browser screenshot "/tmp/page_${SCREENSHOT_NAME}.png" 2>&1 | tail -1

# Get main content snapshot
echo "=== MAIN CONTENT SNIPPET ==="
agent-browser snapshot -s "main" 2>&1 | head -80

echo ""
echo "=== URL ==="
agent-browser get url 2>&1

echo ""
echo "=== ERRORS (page console) ==="
agent-browser errors 2>&1 | tail -10 || true
