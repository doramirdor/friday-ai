// Navigation handling for the mockup
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const screens = document.querySelectorAll('.screen');

    // Handle navigation between screens
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            const targetScreen = this.getAttribute('data-screen');
            
            // Update active nav link
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            // Show target screen
            screens.forEach(screen => {
                screen.classList.remove('active');
                if (screen.id === targetScreen) {
                    screen.classList.add('active');
                }
            });
            
            // Load screen content if needed
            loadScreenContent(targetScreen);
        });
    });

    // Load initial content
    loadScreenContent('library');
});

function loadScreenContent(screenName) {
    switch (screenName) {
        case 'library':
            if (typeof renderLibraryContent === 'function') {
                renderLibraryContent();
            }
            break;
        case 'transcript':
            if (typeof renderTranscriptContent === 'function') {
                renderTranscriptContent();
            }
            break;
        case 'settings':
            if (typeof renderSettingsContent === 'function') {
                renderSettingsContent();
            }
            break;
        case 'components':
            if (typeof renderComponentsContent === 'function') {
                renderComponentsContent();
            }
            break;
    }
}

// Utility functions for the mockup
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function showToast(message, type = 'info') {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Style the toast
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: type === 'success' ? 'var(--status-success)' : 
                   type === 'error' ? 'var(--status-error)' : 'var(--status-info)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: '2000',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease'
    });
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
    
    // Reinitialize icons for the toast
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
} 