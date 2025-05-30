// Settings screen content
function renderSettingsContent() {
    const container = document.getElementById('settings-content');
    
    container.innerHTML = `
        <div class="settings-container">
            <!-- Tab Navigation -->
            <div class="tabs">
                <button class="tab active" onclick="switchTab('general')">General</button>
                <button class="tab" onclick="switchTab('shortcuts')">Shortcuts</button>
                <button class="tab" onclick="switchTab('transcription')">Transcription</button>
                <button class="tab" onclick="switchTab('about')">About</button>
            </div>
            
            <!-- Tab Content -->
            <div id="tab-content">
                ${renderGeneralTab()}
            </div>
        </div>
    `;
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function switchTab(tabName) {
    // Update active tab
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update content
    const content = document.getElementById('tab-content');
    switch (tabName) {
        case 'general':
            content.innerHTML = renderGeneralTab();
            break;
        case 'shortcuts':
            content.innerHTML = renderShortcutsTab();
            break;
        case 'transcription':
            content.innerHTML = renderTranscriptionTab();
            break;
        case 'about':
            content.innerHTML = renderAboutTab();
            break;
    }
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderGeneralTab() {
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">General Settings</h3>
            </div>
            <div class="card-body">
                <div class="settings-section">
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Default Save Location</h4>
                            <p>Choose where recordings are saved by default</p>
                        </div>
                        <div class="settings-control">
                            <div class="flex gap-sm">
                                <input type="text" class="input" value="~/Documents/Friday Recordings" readonly style="min-width: 200px;">
                                <button class="btn btn-secondary">
                                    <i data-lucide="folder"></i>
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Launch at Login</h4>
                            <p>Automatically start Friday when you log in to your Mac</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Theme</h4>
                            <p>Choose your preferred appearance</p>
                        </div>
                        <div class="settings-control">
                            <select class="input" style="min-width: 150px;">
                                <option value="auto" selected>Auto (System)</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Show in Menu Bar</h4>
                            <p>Display Friday icon in the macOS menu bar</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Auto-save Recordings</h4>
                            <p>Automatically save recordings when they stop</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderShortcutsTab() {
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Keyboard Shortcuts</h3>
            </div>
            <div class="card-body">
                <div class="settings-section">
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Start/Stop Recording</h4>
                            <p>Global hotkey to start or stop recording</p>
                        </div>
                        <div class="settings-control">
                            <div class="shortcut-input">
                                <kbd>⌘</kbd> + <kbd>L</kbd>
                                <button class="btn btn-ghost btn-sm" onclick="editShortcut('record')">
                                    <i data-lucide="edit-2"></i>
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Quick Note</h4>
                            <p>Quickly add a note during recording</p>
                        </div>
                        <div class="settings-control">
                            <div class="shortcut-input">
                                <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>
                                <button class="btn btn-ghost btn-sm" onclick="editShortcut('note')">
                                    <i data-lucide="edit-2"></i>
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Show/Hide Window</h4>
                            <p>Toggle Friday window visibility</p>
                        </div>
                        <div class="settings-control">
                            <div class="shortcut-input">
                                <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
                                <button class="btn btn-ghost btn-sm" onclick="editShortcut('window')">
                                    <i data-lucide="edit-2"></i>
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Pause/Resume Recording</h4>
                            <p>Temporarily pause active recording</p>
                        </div>
                        <div class="settings-control">
                            <div class="shortcut-input">
                                <kbd>⌘</kbd> + <kbd>P</kbd>
                                <button class="btn btn-ghost btn-sm" onclick="editShortcut('pause')">
                                    <i data-lucide="edit-2"></i>
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 24px; padding: 16px; background: var(--green-light); border-radius: var(--radius-md); color: var(--green-dark);">
                    <div class="flex gap-sm items-center">
                        <i data-lucide="info" style="width: 16px; height: 16px;"></i>
                        <span class="text-sm font-medium">Tip: Global shortcuts work from any application</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderTranscriptionTab() {
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Transcription Settings</h3>
            </div>
            <div class="card-body">
                <div class="settings-section">
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Real-time Transcription</h4>
                            <p>Generate transcript while recording (requires internet)</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Transcription Language</h4>
                            <p>Primary language for speech recognition</p>
                        </div>
                        <div class="settings-control">
                            <select class="input" style="min-width: 150px;">
                                <option value="en-US" selected>English (US)</option>
                                <option value="en-GB">English (UK)</option>
                                <option value="es-ES">Spanish</option>
                                <option value="fr-FR">French</option>
                                <option value="de-DE">German</option>
                                <option value="ja-JP">Japanese</option>
                                <option value="zh-CN">Chinese (Simplified)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Gemini API Key</h4>
                            <p>Required for AI-powered transcription and analysis</p>
                        </div>
                        <div class="settings-control">
                            <div class="input-group" style="margin-bottom: 0;">
                                <input type="password" class="input input-floating" placeholder=" " value="sk-..." id="api-key-input">
                                <label class="input-label">API Key</label>
                            </div>
                            <div style="margin-top: 8px;">
                                <a href="#" class="text-sm" style="color: var(--interactive-primary); text-decoration: none;">
                                    <i data-lucide="external-link" style="width: 12px; height: 12px;"></i>
                                    Get your Gemini API key
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Auto-generate Action Items</h4>
                            <p>Automatically extract action items from transcripts</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Auto-suggest Tags</h4>
                            <p>Suggest relevant tags based on transcript content</p>
                        </div>
                        <div class="settings-control">
                            <label class="toggle">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 24px;">
                    <button class="btn btn-secondary">
                        <i data-lucide="download"></i>
                        Test Connection
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderAboutTab() {
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">About Friday</h3>
            </div>
            <div class="card-body">
                <div class="text-center mb-xl">
                    <div style="width: 80px; height: 80px; background: var(--green-primary); border-radius: var(--radius-xl); margin: 0 auto var(--spacing-lg); display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="mic" style="width: 40px; height: 40px; color: white;"></i>
                    </div>
                    <h2 style="margin: 0 0 var(--spacing-sm) 0;">Friday</h2>
                    <p class="text-secondary">Version 1.0.0 (Build 2024.01.15)</p>
                </div>
                
                <div class="settings-section">
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Check for Updates</h4>
                            <p>Automatically check for new versions</p>
                        </div>
                        <div class="settings-control">
                            <button class="btn btn-secondary">
                                <i data-lucide="download"></i>
                                Check Now
                            </button>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Privacy Policy</h4>
                            <p>Learn how we protect your data</p>
                        </div>
                        <div class="settings-control">
                            <button class="btn btn-ghost">
                                <i data-lucide="external-link"></i>
                                View Policy
                            </button>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Terms of Service</h4>
                            <p>Review our terms and conditions</p>
                        </div>
                        <div class="settings-control">
                            <button class="btn btn-ghost">
                                <i data-lucide="external-link"></i>
                                View Terms
                            </button>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-label">
                            <h4>Support</h4>
                            <p>Get help and send feedback</p>
                        </div>
                        <div class="settings-control">
                            <button class="btn btn-ghost">
                                <i data-lucide="help-circle"></i>
                                Contact Support
                            </button>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 32px; padding: 16px; background: var(--surface-secondary); border-radius: var(--radius-md); text-align: center;">
                    <p class="text-sm text-secondary" style="margin: 0;">
                        Made with ❤️ for productive conversations
                    </p>
                </div>
            </div>
        </div>
    `;
}

// Interactive functions
function editShortcut(shortcutType) {
    showToast(`Shortcut editor for ${shortcutType} would open here`, 'info');
}

// Add styles for shortcut display
const style = document.createElement('style');
style.textContent = `
    .shortcut-input {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
    }
    
    .shortcut-input kbd {
        display: inline-block;
        padding: 4px 8px;
        background: var(--surface-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-family: monospace;
        font-size: var(--font-size-xs);
        color: var(--text-primary);
        font-weight: var(--font-weight-medium);
        min-width: 24px;
        text-align: center;
    }
`;
document.head.appendChild(style); 