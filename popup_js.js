class PopupController {
    constructor() {
        this.currentTabId = null;
        this.currentUrl = null;
        this.updateInterval = null;
        this.init();
    }

    async init() {
        await this.getCurrentTab();
        this.setupEventListeners();
        this.startUpdating();
        await this.updateDisplay();
    }

    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTabId = tab.id;
        this.currentUrl = new URL(tab.url).hostname;
    }

    setupEventListeners() {
        document.getElementById('view-dashboard').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
        });

        document.getElementById('reset-today').addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset today\'s data?')) {
                await this.resetTodayData();
                await this.updateDisplay();
            }
        });
    }

    startUpdating() {
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 1000);
    }

    async updateDisplay() {
        await this.updateCurrentSite();
        await this.updateTodayStats();
        await this.updateTopSites();
    }

    async updateCurrentSite() {
        const urlElement = document.getElementById('current-url');
        const categoryElement = document.getElementById('current-category');
        const timeElement = document.getElementById('current-time');

        urlElement.textContent = this.currentUrl || 'Unknown';
        
        const category = this.getWebsiteCategory(this.currentUrl);
        categoryElement.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        categoryElement.className = `category-badge ${category}`;

        // Get current session time for this site
        const sessionTime = await this.getCurrentSessionTime();
        timeElement.textContent = this.formatTime(sessionTime);
    }

    async getCurrentSessionTime() {
        const result = await chrome.storage.local.get(['currentSession']);
        const session = result.currentSession || {};
        
        if (session.url === this.currentUrl && session.startTime) {
            return Math.floor((Date.now() - session.startTime) / 1000);
        }
        return 0;
    }

    async updateTodayStats() {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get([today]);
        const todayData = result[today] || {};

        let productiveTime = 0;
        let unproductiveTime = 0;
        let totalTime = 0;

        Object.entries(todayData).forEach(([url, time]) => {
            const category = this.getWebsiteCategory(url);
            totalTime += time;
            
            if (category === 'productive') {
                productiveTime += time;
            } else if (category === 'unproductive') {
                unproductiveTime += time;
            }
        });

        document.getElementById('productive-time').textContent = this.formatTime(productiveTime);
        document.getElementById('unproductive-time').textContent = this.formatTime(unproductiveTime);
        
        const productivityScore = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
        document.getElementById('productivity-percentage').textContent = `${productivityScore}%`;
    }

    async updateTopSites() {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get([today]);
        const todayData = result[today] || {};

        const sortedSites = Object.entries(todayData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        const topSitesContainer = document.getElementById('top-sites-list');
        
        if (sortedSites.length === 0) {
            topSitesContainer.innerHTML = '<div class="site-item"><span class="site-name">No data yet</span><span class="site-time">0m</span></div>';
            return;
        }

        topSitesContainer.innerHTML = sortedSites.map(([url, time]) => `
            <div class="site-item">
                <span class="site-name">${url}</span>
                <span class="site-time">${this.formatTime(time)}</span>
            </div>
        `).join('');
    }

    async resetTodayData() {
        const today = new Date().toDateString();
        await chrome.storage.local.remove([today]);
        
        // Also reset current session
        await chrome.storage.local.remove(['currentSession']);
    }

    getWebsiteCategory(url) {
        if (!url) return 'neutral';

        const productiveSites = [
            'github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.google.com',
            'medium.com', 'dev.to', 'codepen.io', 'jsfiddle.net', 'codesandbox.io',
            'freecodecamp.org', 'coursera.org', 'udemy.com', 'khan.academy.org',
            'leetcode.com', 'hackerrank.com', 'codecademy.com', 'pluralsight.com',
            'linkedin.com/learning', 'w3schools.com', 'geeksforgeeks.org'
        ];

        const unproductiveSites = [
            'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'snapchat.com',
            'reddit.com', 'youtube.com', 'netflix.com', 'hulu.com', 'twitch.tv',
            'pinterest.com', 'tumblr.com', 'discord.com', 'whatsapp.com', 'telegram.org',
            'gaming.youtube.com', 'game.com', 'steam.com', 'origin.com', 'epicgames.com'
        ];

        const urlLower = url.toLowerCase();
        
        if (productiveSites.some(site => urlLower.includes(site))) {
            return 'productive';
        }
        
        if (unproductiveSites.some(site => urlLower.includes(site))) {
            return 'unproductive';
        }
        
        return 'neutral';
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});