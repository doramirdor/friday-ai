#!/bin/bash

# Friday Build Testing Script
# Tests all components needed for production deployment

set -e

echo "🧪 Testing Friday Build Process..."
echo "=================================="

# Test Python availability
echo "🐍 Testing Python..."
if command -v python3 &> /dev/null; then
    echo "✅ Python found: $(python3 --version)"
else
    echo "❌ Python3 not found"
    exit 1
fi

# Test Node.js
echo "📦 Testing Node.js..."
if command -v node &> /dev/null; then
    echo "✅ Node.js found: $(node --version)"
else
    echo "❌ Node.js not found"
    exit 1
fi

# Test Python dependencies
echo "📋 Testing Python dependencies..."
python3 -c "import pyinstaller" 2>/dev/null && echo "✅ PyInstaller available" || {
    echo "⚠️ Installing PyInstaller..."
    pip3 install pyinstaller
}

python3 -c "import requests" 2>/dev/null && echo "✅ requests available" || {
    echo "⚠️ Installing requests..."
    pip3 install requests
}

# Test bundling script
echo "📜 Testing Python bundling script..."
if [ -f "scripts/bundle_python.sh" ]; then
    if [ -x "scripts/bundle_python.sh" ]; then
        echo "✅ Bundle script exists and is executable"
    else
        echo "⚠️ Making bundle script executable..."
        chmod +x scripts/bundle_python.sh
    fi
else
    echo "❌ Bundle script not found"
    exit 1
fi

# Test resources
echo "📁 Testing resources directory..."
if [ -d "resources" ]; then
    echo "✅ Resources directory exists"
else
    echo "❌ Resources directory not found"
    exit 1
fi

# Test npm dependencies
echo "📦 Testing npm dependencies..."
if [ -f "package.json" ]; then
    echo "✅ package.json found"
    if [ ! -d "node_modules" ]; then
        echo "⚠️ Installing npm dependencies..."
        npm install
    fi
else
    echo "❌ package.json not found"
    exit 1
fi

# Quick bundling test
echo "🏗️ Running quick Python bundling test..."
mkdir -p test_build

cat > test_build/test.py << 'EOF'
import sys
print(f"Test successful - Python {sys.version}")
EOF

if pyinstaller --onefile --distpath test_build --workpath test_build/work --specpath test_build test_build/test.py &>/dev/null; then
    echo "✅ Python bundling test successful"
    if ./test_build/test &>/dev/null; then
        echo "✅ Bundled executable works"
    fi
    rm -rf test_build
else
    echo "❌ Python bundling test failed"
    rm -rf test_build
    exit 1
fi

echo ""
echo "🎉 All tests passed! Friday is ready for production build."
echo ""
echo "Next steps:"
echo "1. Run 'npm run build' for full build"
echo "2. Run 'npm run dist:mac' for macOS distribution"
echo "3. Test the built app thoroughly" 