// Component Library screen content
function renderComponentsContent() {
    const container = document.getElementById('components-content');
    
    container.innerHTML = `
        <!-- Design Tokens Section -->
        <div class="tokens-section">
            <h3>Design Tokens</h3>
            <div class="component-grid">
                ${renderColorTokens()}
                ${renderTypographyTokens()}
                ${renderSpacingTokens()}
            </div>
        </div>
        
        <!-- Components Section -->
        <div class="tokens-section">
            <h3>Components</h3>
            <div class="component-grid">
                ${renderButtonComponents()}
                ${renderInputComponents()}
                ${renderToggleComponents()}
                ${renderTagComponents()}
                ${renderModalComponents()}
                ${renderTableComponents()}
                ${renderWaveformComponents()}
                ${renderTranscriptComponents()}
            </div>
        </div>
    `;
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderColorTokens() {
    const colors = [
        { name: 'Green Primary', value: '#28C76F', var: '--green-primary' },
        { name: 'Green Hover', value: '#5BD48D', var: '--green-hover' },
        { name: 'Green Dark', value: '#1D9F55', var: '--green-dark' },
        { name: 'White', value: '#FFFFFF', var: '--white' },
        { name: 'Gray 50', value: '#F6F6F7', var: '--gray-50' },
        { name: 'Gray 100', value: '#E5E5E7', var: '--gray-100' },
        { name: 'Gray 200', value: '#CACBCC', var: '--gray-200' },
        { name: 'Gray 500', value: '#8B8C8F', var: '--gray-500' },
        { name: 'Gray 900', value: '#1C1C1E', var: '--gray-900' }
    ];
    
    return `
        <div class="component-demo">
            <h3>Color Palette</h3>
            ${colors.map(color => `
                <div class="demo-item">
                    <div class="color-swatch">
                        <div class="color-preview" style="background-color: ${color.value};"></div>
                        <div class="color-info">
                            <div class="color-name">${color.name}</div>
                            <div class="color-value">${color.value}</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTypographyTokens() {
    return `
        <div class="component-demo">
            <h3>Typography</h3>
            <div class="demo-item">
                <div class="demo-label">Font Family</div>
                <div style="font-family: var(--font-family);">Inter, SF Pro Display</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">3XL - 30px</div>
                <div class="text-3xl font-bold">The quick brown fox</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">2XL - 24px</div>
                <div class="text-2xl font-semibold">The quick brown fox</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">XL - 20px</div>
                <div class="text-xl font-medium">The quick brown fox</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">Base - 15px</div>
                <div class="text-base">The quick brown fox</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">SM - 13px</div>
                <div class="text-sm">The quick brown fox</div>
            </div>
            <div class="demo-item">
                <div class="demo-label">XS - 11px</div>
                <div class="text-xs">The quick brown fox</div>
            </div>
        </div>
    `;
}

function renderSpacingTokens() {
    return `
        <div class="component-demo">
            <h3>Spacing Scale</h3>
            <div class="demo-item">
                <div class="demo-label">XS - 4px</div>
                <div style="width: 4px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">SM - 8px</div>
                <div style="width: 8px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">MD - 12px</div>
                <div style="width: 12px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">LG - 16px</div>
                <div style="width: 16px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">XL - 24px</div>
                <div style="width: 24px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">2XL - 32px</div>
                <div style="width: 32px; height: 16px; background: var(--green-primary);"></div>
            </div>
            <div class="demo-item">
                <div class="demo-label">3XL - 48px</div>
                <div style="width: 48px; height: 16px; background: var(--green-primary);"></div>
            </div>
        </div>
    `;
}

function renderButtonComponents() {
    return `
        <div class="component-demo">
            <h3>Buttons</h3>
            <div class="demo-item">
                <div class="demo-label">Primary Button</div>
                <button class="btn btn-primary">
                    <i data-lucide="mic"></i>
                    Start Recording
                </button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Secondary Button</div>
                <button class="btn btn-secondary">
                    <i data-lucide="settings"></i>
                    Settings
                </button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Ghost Button</div>
                <button class="btn btn-ghost">
                    <i data-lucide="help-circle"></i>
                    Help
                </button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Icon Button</div>
                <button class="btn btn-ghost btn-icon">
                    <i data-lucide="play"></i>
                </button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Small Button</div>
                <button class="btn btn-primary btn-sm">Small</button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Large Button</div>
                <button class="btn btn-primary btn-lg">Large Button</button>
            </div>
            <div class="demo-item">
                <div class="demo-label">Disabled Button</div>
                <button class="btn btn-primary" disabled>Disabled</button>
            </div>
        </div>
    `;
}

function renderInputComponents() {
    return `
        <div class="component-demo">
            <h3>Inputs</h3>
            <div class="demo-item">
                <div class="demo-label">Standard Input</div>
                <input type="text" class="input" placeholder="Enter text...">
            </div>
            <div class="demo-item">
                <div class="demo-label">Floating Label Input</div>
                <div class="input-group">
                    <input type="text" class="input input-floating" placeholder=" " value="Sample text">
                    <label class="input-label">Title</label>
                </div>
            </div>
            <div class="demo-item">
                <div class="demo-label">Textarea</div>
                <textarea class="input textarea" placeholder="Enter description..."></textarea>
            </div>
            <div class="demo-item">
                <div class="demo-label">Select</div>
                <select class="input">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                </select>
            </div>
        </div>
    `;
}

function renderToggleComponents() {
    return `
        <div class="component-demo">
            <h3>Toggle Switch</h3>
            <div class="demo-item">
                <div class="demo-label">Off State</div>
                <label class="toggle">
                    <input type="checkbox">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="demo-item">
                <div class="demo-label">On State</div>
                <label class="toggle">
                    <input type="checkbox" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
    `;
}

function renderTagComponents() {
    return `
        <div class="component-demo">
            <h3>Tags</h3>
            <div class="demo-item">
                <div class="demo-label">Basic Tag</div>
                <span class="tag">meeting</span>
            </div>
            <div class="demo-item">
                <div class="demo-label">Deletable Tag</div>
                <span class="tag tag-deletable">
                    standup
                    <button class="tag-delete" onclick="removeComponentTag(this)">
                        <i data-lucide="x"></i>
                    </button>
                </span>
            </div>
            <div class="demo-item">
                <div class="demo-label">Tag Input Container</div>
                <div class="tag-input-container">
                    <span class="tag tag-deletable">
                        existing
                        <button class="tag-delete" onclick="removeComponentTag(this)">
                            <i data-lucide="x"></i>
                        </button>
                    </span>
                    <input type="text" class="tag-input" placeholder="Add tag...">
                </div>
            </div>
        </div>
    `;
}

function renderModalComponents() {
    return `
        <div class="component-demo">
            <h3>Modal Dialog</h3>
            <div class="demo-item">
                <button class="btn btn-secondary" onclick="showDemoModal()">
                    Show Modal Example
                </button>
            </div>
        </div>
        
        <!-- Demo Modal -->
        <div class="modal-overlay" id="demo-modal">
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">Example Modal</h3>
                </div>
                <div class="modal-body">
                    <p>This is an example of how modals look in the Friday app. They have a subtle backdrop blur and smooth animations.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="hideModal('demo-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="hideModal('demo-modal')">Confirm</button>
                </div>
            </div>
        </div>
    `;
}

function renderTableComponents() {
    return `
        <div class="component-demo">
            <h3>Table</h3>
            <div class="demo-item">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Value</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Recording 1</td>
                                <td class="text-secondary">15:32</td>
                                <td>
                                    <div class="action-bar">
                                        <button class="btn btn-ghost btn-icon btn-sm">
                                            <i data-lucide="play"></i>
                                        </button>
                                        <button class="btn btn-ghost btn-icon btn-sm">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td>Recording 2</td>
                                <td class="text-secondary">28:45</td>
                                <td>
                                    <div class="action-bar">
                                        <button class="btn btn-ghost btn-icon btn-sm">
                                            <i data-lucide="play"></i>
                                        </button>
                                        <button class="btn btn-ghost btn-icon btn-sm">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderWaveformComponents() {
    return `
        <div class="component-demo">
            <h3>Waveform Player</h3>
            <div class="demo-item">
                <div class="waveform-player">
                    <div class="waveform-controls">
                        <button class="btn btn-ghost btn-icon" onclick="toggleDemoPlayback()">
                            <i data-lucide="play" id="demo-play-icon"></i>
                        </button>
                        <div class="waveform-time">
                            <span>02:15</span> / <span>15:32</span>
                        </div>
                    </div>
                    
                    <div class="waveform-track" onclick="seekDemo(event)">
                        <div class="waveform-progress" id="demo-progress" style="width: 25%;"></div>
                        <div class="waveform-handle" id="demo-handle" style="left: 25%;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderTranscriptComponents() {
    return `
        <div class="component-demo">
            <h3>Transcript Lines</h3>
            <div class="demo-item">
                <div class="transcript-line">
                    <div class="transcript-time">00:15</div>
                    <div class="transcript-text">This is a sample transcript line that shows how text appears in the transcript view.</div>
                </div>
                <div class="transcript-line active">
                    <div class="transcript-time">00:28</div>
                    <div class="transcript-text">This line is currently active and highlighted during playback.</div>
                </div>
                <div class="transcript-line">
                    <div class="transcript-time">00:42</div>
                    <div class="transcript-text">Lines can be clicked to jump to that time in the recording.</div>
                </div>
            </div>
        </div>
    `;
}

// Interactive demo functions
let demoPlaying = false;

function showDemoModal() {
    showModal('demo-modal');
}

function removeComponentTag(button) {
    const tag = button.closest('.tag');
    tag.style.transform = 'scale(0)';
    tag.style.opacity = '0';
    setTimeout(() => {
        tag.remove();
    }, 150);
}

function toggleDemoPlayback() {
    demoPlaying = !demoPlaying;
    const icon = document.getElementById('demo-play-icon');
    
    if (demoPlaying) {
        icon.setAttribute('data-lucide', 'pause');
    } else {
        icon.setAttribute('data-lucide', 'play');
    }
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function seekDemo(event) {
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    
    const progress = document.getElementById('demo-progress');
    const handle = document.getElementById('demo-handle');
    
    if (progress) progress.style.width = percentage + '%';
    if (handle) handle.style.left = percentage + '%';
} 