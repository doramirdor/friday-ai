// Library screen content
function renderLibraryContent() {
    const container = document.getElementById('library-content');
    
    // Sample recordings data
    const recordings = [
        {
            id: 1,
            title: "Team Standup Meeting",
            created: "2024-01-15",
            duration: "15:32",
            tags: ["meeting", "standup", "team"]
        },
        {
            id: 2,
            title: "Product Strategy Discussion",
            created: "2024-01-14",
            duration: "32:18",
            tags: ["strategy", "product", "planning"]
        },
        {
            id: 3,
            title: "Client Feedback Session",
            created: "2024-01-12",
            duration: "28:45",
            tags: ["client", "feedback", "design"]
        },
        {
            id: 4,
            title: "Code Review Session",
            created: "2024-01-10",
            duration: "22:15",
            tags: ["code", "review", "development"]
        }
    ];
    
    const hasRecordings = recordings.length > 0;
    
    container.innerHTML = `
        <div class="app">
            <!-- Toolbar -->
            <div class="toolbar">
                <div class="toolbar-left">
                    <h1 class="toolbar-title">Friday</h1>
                </div>
                <div class="toolbar-right">
                    <button class="btn btn-primary btn-lg" onclick="startRecording()">
                        <i data-lucide="mic"></i>
                        Start Recording
                    </button>
                    <button class="btn btn-ghost btn-icon" onclick="openSettings()">
                        <i data-lucide="settings"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon" onclick="openHelp()">
                        <i data-lucide="help-circle"></i>
                    </button>
                </div>
            </div>
            
            <!-- Main Content -->
            <div class="main-content">
                <div class="library-container">
                    ${hasRecordings ? renderRecordingsTable(recordings) : renderEmptyState()}
                </div>
            </div>
        </div>
        
        <!-- Delete Confirmation Modal -->
        <div class="modal-overlay" id="delete-modal">
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">Move to Trash</h3>
                </div>
                <div class="modal-body">
                    <p>Are you sure you want to move this recording to the trash? This action cannot be undone.</p>
                    <p><strong id="delete-recording-title"></strong></p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="hideModal('delete-modal')">Cancel</button>
                    <button class="btn btn-primary" onclick="confirmDelete()" style="background: var(--status-error);">
                        <i data-lucide="trash-2"></i>
                        Move to Trash
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderRecordingsTable(recordings) {
    const rows = recordings.map(recording => `
        <tr onclick="openTranscript(${recording.id})" class="recording-row" data-id="${recording.id}">
            <td>
                <div class="recording-title">${recording.title}</div>
            </td>
            <td class="text-secondary">
                ${formatDate(recording.created)}
            </td>
            <td class="text-secondary monospace">
                ${recording.duration}
            </td>
            <td>
                <div class="flex gap-sm">
                    ${recording.tags.map(tag => `
                        <span class="tag">${tag}</span>
                    `).join('')}
                </div>
            </td>
            <td>
                <div class="action-bar">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="event.stopPropagation(); playRecording(${recording.id})">
                        <i data-lucide="play"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="event.stopPropagation(); deleteRecording(${recording.id}, '${recording.title}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    return `
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Created On</th>
                        <th>Duration</th>
                        <th>Tags</th>
                        <th style="width: 120px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="library-empty">
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i data-lucide="mic-off" style="width: 64px; height: 64px;"></i>
                </div>
                <h3 class="empty-state-title">No recordings yet</h3>
                <p class="empty-state-description">
                    Start your first recording by clicking the "Start Recording" button above,<br>
                    or press <kbd>⌘ L</kbd> to quick start.
                </p>
                <button class="btn btn-primary" onclick="startRecording()">
                    <i data-lucide="mic"></i>
                    Start Your First Recording
                </button>
            </div>
        </div>
    `;
}

// Interactive functions
function startRecording() {
    showToast('Recording started! Press ⌘ L again to stop.', 'success');
}

function openSettings() {
    // Switch to settings screen
    document.querySelector('[data-screen="settings"]').click();
}

function openHelp() {
    showToast('Help documentation would open here', 'info');
}

function openTranscript(recordingId) {
    // Switch to transcript screen
    document.querySelector('[data-screen="transcript"]').click();
    showToast(`Opening transcript for recording ${recordingId}`, 'info');
}

function playRecording(recordingId) {
    showToast(`Playing recording ${recordingId}`, 'info');
}

let recordingToDelete = null;

function deleteRecording(recordingId, title) {
    recordingToDelete = recordingId;
    document.getElementById('delete-recording-title').textContent = title;
    showModal('delete-modal');
}

function confirmDelete() {
    if (recordingToDelete) {
        // Animate row removal
        const row = document.querySelector(`[data-id="${recordingToDelete}"]`);
        if (row) {
            row.style.transform = 'translateX(-100%)';
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
                // Check if table is now empty
                const remainingRows = document.querySelectorAll('.recording-row');
                if (remainingRows.length === 0) {
                    // Re-render with empty state
                    renderLibraryContent();
                }
            }, 300);
        }
        
        hideModal('delete-modal');
        showToast('Recording moved to trash', 'success');
        recordingToDelete = null;
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Modal click outside to close
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        const modalId = event.target.id;
        hideModal(modalId);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    if (event.metaKey && event.key === 'l') {
        event.preventDefault();
        startRecording();
    }
}); 