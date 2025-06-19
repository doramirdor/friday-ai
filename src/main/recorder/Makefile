# Makefile for Friday Swift Recorder
SWIFT_FILES = main.swift
TARGET = Recorder
BUILD_DIR = .

# Compiler flags for ScreenCaptureKit
SWIFT_FLAGS = -framework AVFoundation -framework ScreenCaptureKit -framework CoreGraphics

# Default target
all: $(TARGET)

# Build the recorder
$(TARGET): $(SWIFT_FILES)
	@echo "🔨 Building Swift recorder with ScreenCaptureKit..."
	swiftc $(SWIFT_FLAGS) -o $(BUILD_DIR)/$(TARGET) $(SWIFT_FILES)
	@echo "✅ Build complete: $(BUILD_DIR)/$(TARGET)"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -f $(BUILD_DIR)/$(TARGET)
	rm -f *.o
	@echo "✅ Clean complete"

# Test the recorder
test: $(TARGET)
	@echo "🧪 Testing recorder..."
	../../../$(TARGET) --test
	@echo "✅ Test complete"

# Install dependencies (if needed)
install: $(TARGET)
	@echo "📦 Installing recorder to project root..."
	cp $(BUILD_DIR)/$(TARGET) ../../../$(TARGET)
	@echo "✅ Installation complete"

.PHONY: all clean test install 