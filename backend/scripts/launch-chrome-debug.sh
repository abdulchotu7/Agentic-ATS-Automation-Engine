#!/bin/bash

echo "🔍 Checking for existing Chrome processes..."
if pgrep -f "Google Chrome" > /dev/null; then
    echo "⚠️  Chrome is running. Killing all Chrome processes..."
    pkill -9 "Google Chrome"
    sleep 2
    echo "✅ Chrome processes killed"
else
    echo "✅ No Chrome processes found"
fi

echo ""
# Use an isolated profile for Playwright to avoid conflicts and security blocks
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome-Playwright"

echo "   📋 Using isolated profile at: $CHROME_PROFILE"
echo "   💡 Note: You may need to log into LinkedIn/Google on this profile once."

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$CHROME_PROFILE" &

sleep 3

echo ""
echo "🔍 Verifying Chrome is listening on port 9222..."
if lsof -i :9222 > /dev/null 2>&1; then
    echo "✅ Chrome is listening on port 9222"
    echo ""
    echo "📋 Visit this URL to verify CDP is working:"
    echo "   http://localhost:9222/json/version"
    echo ""
    echo "🎯 Now run your Playwright script:"
    echo "   npm run router -- --result result.json --dry-run"
else
    echo "❌ Chrome is NOT listening on port 9222"
    echo "   Please check for errors above"
fi
