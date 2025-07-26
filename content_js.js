// Content script for detecting user activity and idle time
class ActivityDetector {
    constructor() {
        this.isActive = true;
        this.lastActivity = Date.now();
        this.idleThreshold = 30000; // 30 seconds
        this.idleTimer = null;
        
        this.init();
    }

    init() {
        this.setupActivityListeners();
        this.startIdleDetection();
    }

    setupActivityListeners() {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        
        events.forEach(event => {
            document.addEventListener(event, () => {
                this.handleActivity();
            }, { passive: true });
        });

        // Listen for visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handleIdle();
            } else {
                this.handleActivity();
            }
        });
    }

    handleActivity() {
        this.lastActivity = Date.now();
        
        if (!this.isActive) {
            this.isActive = true;
            this.notifyBackgroundScript('activity_resumed');
        }

        // Reset idle timer
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => {
            this.handleIdle();
        }, this.idleThreshold);
    }

    handleIdle() {
        if (this.isActive) {
            this.isActive = false;
            this.notifyBackgroundScript('activity_idle');
        }
    }

    startIdleDetection() {
        // Initial activity detection
        this.handleActivity();
    }

    notifyBackgroundScript(action) {
        try {
            chrome.runtime.sendMessage({
                action: action,
                timestamp: Date.now(),
                url: window.location.hostname
            });
        } catch (error) {
            // Extension context invalidated, ignore
        }
    }

    // Method to update idle threshold from settings
    updateIdleThreshold(threshold) {
        this.idleThreshold = threshold;
    }
}

// Initialize activity detector
const activityDetector = new ActivityDetector();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateIdleThreshold') {
        activityDetector.updateIdleThreshold(request.threshold);
        sendResponse({ success: true });
    }
});

// Notify background script that content script is loaded
chrome.runtime.sendMessage({
    action: 'content_script_loaded',
    url: window.location.hostname
});