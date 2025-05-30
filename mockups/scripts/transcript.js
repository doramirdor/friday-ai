// Transcript Details screen content
function renderTranscriptContent() {
    const container = document.getElementById('transcript-content');
    
    const sampleTranscript = [
        { time: "00:15", text: "Okay, let's start today's standup meeting. We have several important topics to cover." },
        { time: "00:28", text: "First, let me go over what we accomplished yesterday and what we're planning for today." },
        { time: "00:42", text: "John, would you like to share your updates on the authentication system?" },
        { time: "01:05", text: "Sure! Yesterday I finished implementing the OAuth integration with Google and GitHub." },
        { time: "01:18", text: "Today I'm planning to work on the password reset functionality and write some tests." },
        { time: "01:32", text: "Great work! Any blockers or challenges you're facing?" },
        { time: "01:45", text: "Not really, everything is going smoothly. The API documentation was really helpful." },
        { time: "02:02", text: "Perfect. Sarah, what about the UI components you've been working on?" },
        { time: "02:15", text: "I've completed the design system foundation and implemented the core button components." },
        { time: "02:28", text: "The focus states and accessibility features are all working as expected." }
    ];
    
    container.innerHTML = `
        <div class="transcript-layout">
            <!-- Main Content (Left 72%) -->
            <div class="transcript-main">
                <!-- Waveform Player -->
                <div class="waveform-player">
                    <div class="waveform-controls">
                        <button class="btn btn-ghost btn-icon" id="play-pause-btn">
                            <i data-lucide="play"></i>
                        </button>
                        <div class="waveform-time">
                            <span id="current-time">00:00</span> / <span id="total-time">15:32</span>
                        </div>
                    </div>
                    
                    <div class="waveform-track" id="waveform-track">
                        <div class="waveform-progress" id="waveform-progress" style="width: 15%;"></div>
                        <div class="waveform-handle" id="waveform-handle" style="left: 15%;"></div>
                    </div>
                </div>
                
                <!-- Transcript Content -->
                <div class="transcript-content">
                    <h3 style="margin-top: 0; color: var(--text-primary);">Transcript</h3>
                    <div class="transcript-lines">
                        ${sampleTranscript.map((line, index) => `
                            <div class="transcript-line ${index === 2 ? 'active' : ''}" data-time="${line.time}">
                                <div class="transcript-time">${line.time}</div>
                                <div class="transcript-text" contenteditable="true">${line.text}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Sidebar (Right 28%) -->
            <div class="transcript-sidebar">
                <!-- Recording Info Card -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Recording Details</h3>
                    </div>
                    <div class="card-body">
                        <div class="input-group">
                            <input type="text" class="input input-floating" placeholder=" " value="Team Standup Meeting" id="title-input">
                            <label class="input-label">Title</label>
                        </div>
                        
                        <div class="input-group">
                            <textarea class="input textarea input-floating" placeholder=" " id="description-input">Weekly team standup to discuss progress, blockers, and upcoming tasks. Covered authentication system updates and UI component progress.</textarea>
                            <label class="input-label">Description</label>
                        </div>
                        
                        <div class="input-group">
                            <label class="demo-label">Tags</label>
                            <div class="tag-input-container">
                                <span class="tag tag-deletable">
                                    meeting
                                    <button class="tag-delete" onclick="removeTag(this)">
                                        <i data-lucide="x"></i>
                                    </button>
                                </span>
                                <span class="tag tag-deletable">
                                    standup
                                    <button class="tag-delete" onclick="removeTag(this)">
                                        <i data-lucide="x"></i>
                                    </button>
                                </span>
                                <span class="tag tag-deletable">
                                    team
                                    <button class="tag-delete" onclick="removeTag(this)">
                                        <i data-lucide="x"></i>
                                    </button>
                                </span>
                                <input type="text" class="tag-input" placeholder="Add tag..." onkeypress="handleTagInput(event)">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Action Items Card -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Action Items</h3>
                    </div>
                    <div class="card-body">
                        <div class="action-items">
                            <div class="action-item">
                                <input type="checkbox" id="action-1">
                                <label for="action-1" class="action-item-text">Implement password reset functionality</label>
                            </div>
                            <div class="action-item">
                                <input type="checkbox" id="action-2" checked>
                                <label for="action-2" class="action-item-text completed">Complete OAuth integration with Google and GitHub</label>
                            </div>
                            <div class="action-item">
                                <input type="checkbox" id="action-3">
                                <label for="action-3" class="action-item-text">Write tests for authentication system</label>
                            </div>
                            <div class="action-item">
                                <input type="checkbox" id="action-4">
                                <label for="action-4" class="action-item-text">Review UI component accessibility features</label>
                            </div>
                        </div>
                        
                        <button class="btn btn-ghost btn-sm w-full" onclick="addActionItem()" style="margin-top: 12px;">
                            <i data-lucide="plus"></i>
                            Add Action Item
                        </button>
                    </div>
                </div>
                
                <!-- Save Indicator -->
                <div class="save-indicator saved">
                    <i data-lucide="check"></i>
                    <span>All changes saved</span>
                    <span class="text-xs text-secondary">⌘ S</span>
                </div>
            </div>
        </div>
    `;
    
    // Initialize interactive features
    initializeWaveform();
    initializeTranscriptEditing();
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

let isPlaying = false;
let currentTime = 0;
let totalTime = 932; // 15:32 in seconds

function initializeWaveform() {
    const playBtn = document.getElementById('play-pause-btn');
    const track = document.getElementById('waveform-track');
    const progress = document.getElementById('waveform-progress');
    const handle = document.getElementById('waveform-handle');
    
    if (!playBtn || !track || !progress || !handle) return;
    
    // Play/pause functionality
    playBtn.addEventListener('click', togglePlayback);
    
    // Scrub functionality
    track.addEventListener('click', function(e) {
        const rect = track.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        
        currentTime = Math.floor(percentage * totalTime);
        updateProgress();
        highlightCurrentTranscriptLine();
    });
    
    // Handle dragging
    let isDragging = false;
    
    handle.addEventListener('mousedown', function(e) {
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        const track = document.getElementById('waveform-track');
        const rect = track.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
        
        currentTime = Math.floor(percentage * totalTime);
        updateProgress();
        highlightCurrentTranscriptLine();
    });
    
    document.addEventListener('mouseup', function() {
        isDragging = false;
    });
}

function togglePlayback() {
    isPlaying = !isPlaying;
    const playBtn = document.getElementById('play-pause-btn');
    const icon = playBtn.querySelector('i');
    
    if (isPlaying) {
        icon.setAttribute('data-lucide', 'pause');
        startPlayback();
    } else {
        icon.setAttribute('data-lucide', 'play');
        stopPlayback();
    }
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

let playbackInterval;

function startPlayback() {
    playbackInterval = setInterval(function() {
        currentTime++;
        updateProgress();
        highlightCurrentTranscriptLine();
        
        if (currentTime >= totalTime) {
            stopPlayback();
            currentTime = 0;
            updateProgress();
        }
    }, 100); // Update every 100ms for smooth animation
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    isPlaying = false;
    
    const playBtn = document.getElementById('play-pause-btn');
    const icon = playBtn.querySelector('i');
    icon.setAttribute('data-lucide', 'play');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function updateProgress() {
    const percentage = (currentTime / totalTime) * 100;
    const progress = document.getElementById('waveform-progress');
    const handle = document.getElementById('waveform-handle');
    const currentTimeEl = document.getElementById('current-time');
    
    if (progress) progress.style.width = percentage + '%';
    if (handle) handle.style.left = percentage + '%';
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
}

function highlightCurrentTranscriptLine() {
    const lines = document.querySelectorAll('.transcript-line');
    lines.forEach(line => line.classList.remove('active'));
    
    // Simple logic to highlight current line based on time
    const timeInMinutes = currentTime / 60;
    const lineIndex = Math.floor(timeInMinutes * 4); // Rough approximation
    if (lines[lineIndex]) {
        lines[lineIndex].classList.add('active');
        lines[lineIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function initializeTranscriptEditing() {
    const transcriptLines = document.querySelectorAll('.transcript-text');
    
    transcriptLines.forEach(line => {
        line.addEventListener('click', function() {
            const parent = this.closest('.transcript-line');
            const timeText = parent.querySelector('.transcript-time').textContent;
            
            // Jump to this time in the audio
            currentTime = timeToSeconds(timeText);
            updateProgress();
            highlightCurrentTranscriptLine();
        });
        
        line.addEventListener('input', function() {
            showSaveIndicator('saving');
            // Simulate auto-save
            setTimeout(() => {
                showSaveIndicator('saved');
            }, 1000);
        });
    });
}

// Utility functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function timeToSeconds(timeString) {
    const [mins, secs] = timeString.split(':').map(Number);
    return mins * 60 + secs;
}

function showSaveIndicator(state) {
    const indicator = document.querySelector('.save-indicator');
    if (!indicator) return;
    
    indicator.className = `save-indicator ${state}`;
    
    const icon = indicator.querySelector('i');
    const text = indicator.querySelector('span');
    
    if (state === 'saving') {
        icon.setAttribute('data-lucide', 'loader-2');
        text.textContent = 'Saving changes...';
        icon.style.animation = 'spin 1s linear infinite';
    } else {
        icon.setAttribute('data-lucide', 'check');
        text.textContent = 'All changes saved';
        icon.style.animation = '';
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Tag management
function removeTag(button) {
    const tag = button.closest('.tag');
    tag.remove();
    showSaveIndicator('saving');
    setTimeout(() => showSaveIndicator('saved'), 500);
}

function handleTagInput(event) {
    if (event.key === 'Enter' && event.target.value.trim()) {
        const tagValue = event.target.value.trim();
        const tagContainer = event.target.parentElement;
        
        // Create new tag
        const newTag = document.createElement('span');
        newTag.className = 'tag tag-deletable';
        newTag.innerHTML = `
            ${tagValue}
            <button class="tag-delete" onclick="removeTag(this)">
                <i data-lucide="x"></i>
            </button>
        `;
        
        // Insert before the input
        tagContainer.insertBefore(newTag, event.target);
        event.target.value = '';
        
        // Reinitialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        showSaveIndicator('saving');
        setTimeout(() => showSaveIndicator('saved'), 500);
    }
}

function addActionItem() {
    const container = document.querySelector('.action-items');
    const newId = 'action-' + Date.now();
    
    const newItem = document.createElement('div');
    newItem.className = 'action-item';
    newItem.innerHTML = `
        <input type="checkbox" id="${newId}">
        <label for="${newId}" class="action-item-text" contenteditable="true">New action item...</label>
    `;
    
    container.appendChild(newItem);
    
    // Focus the new item for editing
    const label = newItem.querySelector('.action-item-text');
    label.focus();
    
    // Select all text for easy replacement
    const range = document.createRange();
    range.selectNodeContents(label);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

// CSS animation for spinning loader
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style); 