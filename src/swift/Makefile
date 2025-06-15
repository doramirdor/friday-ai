SWIFT_FILES = Recorder.swift AudioDeviceManager.swift main.swift ResponseHandler.swift PermissionsRequester.swift
EXECUTABLE = Recorder
BUILD_DIR = build
SWIFT_FLAGS = -framework AVFoundation -framework ScreenCaptureKit -framework CoreAudio -framework Foundation

.PHONY: all clean install test test-combined

all: $(BUILD_DIR)/$(EXECUTABLE)

$(BUILD_DIR)/$(EXECUTABLE): $(SWIFT_FILES)
	@mkdir -p $(BUILD_DIR)
	swiftc $(SWIFT_FLAGS) -o $(BUILD_DIR)/$(EXECUTABLE) $(SWIFT_FILES)

install: $(BUILD_DIR)/$(EXECUTABLE)
	cp $(BUILD_DIR)/$(EXECUTABLE) ../../../$(EXECUTABLE)

clean:
	rm -rf $(BUILD_DIR)
	rm -f ../../../$(EXECUTABLE)

test: $(BUILD_DIR)/$(EXECUTABLE)
	$(BUILD_DIR)/$(EXECUTABLE) --check-permissions

test-combined: $(BUILD_DIR)/$(EXECUTABLE)
	$(BUILD_DIR)/$(EXECUTABLE) --record "$(HOME)/Friday Recordings" --source both --filename test-combined

test-mic: $(BUILD_DIR)/$(EXECUTABLE)
	$(BUILD_DIR)/$(EXECUTABLE) --record "$(HOME)/Friday Recordings" --source mic --filename test-mic

test-system: $(BUILD_DIR)/$(EXECUTABLE)
	$(BUILD_DIR)/$(EXECUTABLE) --record "$(HOME)/Friday Recordings" --source system --filename test-system

help:
	@echo "Available targets:"
	@echo "  all          - Build the Swift recorder"
	@echo "  install      - Build and install to root directory"
	@echo "  clean        - Remove build files"
	@echo "  test         - Test permissions"
	@echo "  test-combined- Test combined recording"
	@echo "  test-mic     - Test microphone only"
	@echo "  test-system  - Test system audio only"
	@echo "  help         - Show this help" 