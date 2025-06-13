SWIFT_FILES = Recorder.swift AudioDeviceManager.swift main.swift Extensions.swift PermissionsRequester.swift ResponseHandler.swift
EXECUTABLE = Recorder
BUILD_DIR = build
SWIFT_FLAGS = -framework AVFoundation -framework ScreenCaptureKit -framework CoreAudio -framework Foundation

.PHONY: all clean install

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

.PHONY: all clean install test test-combined 