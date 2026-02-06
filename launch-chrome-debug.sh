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
echo "🚀 Launching Chrome with remote debugging on port 9222..."
echo "   Using your Chrome profile (with existing sessions)..."

# Use a copy of the default profile to avoid conflicts
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome-Playwright"

# Copy the default profile if it doesn't exist
if [ ! -d "$CHROME_PROFILE" ]; then
    echo "   📋 Creating Chrome profile copy for Playwright..."
    cp -r "$HOME/Library/Application Support/Google/Chrome" "$CHROME_PROFILE" 2>/dev/null || true
fi

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$CHROME_PROFILE" \
  --profile-directory="Default" &

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
    echo "   node index.ts"
else
    echo "❌ Chrome is NOT listening on port 9222"
    echo "   Please check for errors above"
fi
