class ProductivityTracker {
    constructor() {
        this.currentSession = {
            url: null,
            startTime: null,
            tabId: null
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startTracking();
    }

    setupEventListeners() {
        // Track tab activation
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.handleTabChange(activeInfo.tabId);
        });

        // Track tab updates (URL changes)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.active) {
                this.handleTabChange(tabId);
            }
        });

        // Track window focus changes
        chrome.windows.onFocusChanged.addListener((windowId) => {
            if (windowId === chrome.windows.WINDOW_ID_NONE) {
                // Browser lost focus
                this.pauseTracking();
            } else {
                // Browser gained focus
                this.resumeTracking();
            }
        });

        // Handle extension startup
        chrome.runtime.onStartup.addListener(() => {
            this.startTracking();
        });

        // Handle extension installation
        chrome.runtime.onInstalled.addListener(() => {
            this.initializeStorage();
        });
    }

    async initializeStorage() {
        const result = await chrome.storage.local.get(['initialized']);
        if (!result.initialized) {
            await chrome.storage.local.set({
                initialized: true,
                totalTime: 0,
                settings: {
                    trackingEnabled: true,
                    idleTime: 30000, // 30 seconds
                    excludedSites: []
                }
            });
        }
    }

    async handleTabChange(tabId) {
        try {
            // Save current session before switching
            await this.saveCurrentSession();

            // Get new tab info
            const tab = await chrome.tabs.get(tabId);
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                this.currentSession = { url: null, startTime: null, tabId: null };
                return;
            }

            // Start new session
            const url = new URL(tab.url).hostname;
            this.currentSession = {
                url: url,
                startTime: Date.now(),
                tabId: tabId
            };

            // Store current session
            await chrome.storage.local.set({ currentSession: this.currentSession });

        } catch (error) {
            console.error('Error handling tab change:', error);
        }
    }

    async saveCurrentSession() {
        if (!this.currentSession.url || !this.currentSession.startTime) {
            return;
        }

        const sessionDuration = Math.floor((Date.now() - this.currentSession.startTime) / 1000);
        
        // Only save if session is longer than 5 seconds
        if (sessionDuration < 5) {
            return;
        }

        const today = new Date().toDateString();
        const result = await chrome.storage.local.get([today]);
        const todayData = result[today] || {};

        // Add time to existing data
        todayData[this.currentSession.url] = (todayData[this.currentSession.url] || 0) + sessionDuration;
        
        await chrome.storage.local.set({ [today]: todayData });

        // Update weekly data for reports
        await this.updateWeeklyData(this.currentSession.url, sessionDuration);
    }

    async updateWeeklyData(url, duration) {
        const result = await chrome.storage.local.get(['weeklyData']);
        const weeklyData = result.weeklyData || {};
        
        const today = new Date();
        const weekKey = this.getWeekKey(today);
        
        if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = {};
        }
        
        if (!weeklyData[weekKey][url]) {
            weeklyData[weekKey][url] = 0;
        }
        
        weeklyData[weekKey][url] += duration;
        
        await chrome.storage.local.set({ weeklyData });
    }

    getWeekKey(date) {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        return startOfWeek.toDateString();
    }

    async startTracking() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await this.handleTabChange(tab.id);
            }
        } catch (error) {
            console.error('Error starting tracking:', error);
        }
    }

    pauseTracking() {
        this.saveCurrentSession();
        this.currentSession = { url: null, startTime: null, tabId: null };
    }

    async resumeTracking() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await this.handleTabChange(tab.id);
            }
        } catch (error) {
            console.error('Error resuming tracking:', error);
        }
    }

    // Generate daily report
    async generateDailyReport(date = new Date()) {
        const dateKey = date.toDateString();
        const result = await chrome.storage.local.get([dateKey]);
        const dayData = result[dateKey] || {};

        let productiveTime = 0;
        let unproductiveTime = 0;
        let neutralTime = 0;
        let totalTime = 0;

        const categorizedSites = Object.entries(dayData).map(([url, time]) => {
            const category = this.getWebsiteCategory(url);
            totalTime += time;
            
            switch (category) {
                case 'productive':
                    productiveTime += time;
                    break;
                case 'unproductive':
                    unproductiveTime += time;
                    break;
                default:
                    neutralTime += time;
            }

            return { url, time, category };
        });

        return {
            date: dateKey,
            totalTime,
            productiveTime,
            unproductiveTime,
            neutralTime,
            productivityScore: totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0,
            sites: categorizedSites.sort((a, b) => b.time - a.time)
        };
    }

    // Generate weekly report
    async generateWeeklyReport(weekStart = new Date()) {
        const weekKey = this.getWeekKey(weekStart);
        const result = await chrome.storage.local.get(['weeklyData']);
        const weeklyData = result.weeklyData || {};
        const weekData = weeklyData[weekKey] || {};

        let productiveTime = 0;
        let unproductiveTime = 0;
        let neutralTime = 0;
        let totalTime = 0;

        const categorizedSites = Object.entries(weekData).map(([url, time]) => {
            const category = this.getWebsiteCategory(url);
            totalTime += time;
            
            switch (category) {
                case 'productive':
                    productiveTime += time;
                    break;
                case 'unproductive':
                    unproductiveTime += time;
                    break;
                default:
                    neutralTime += time;
            }

            return { url, time, category };
        });

        // Get daily breakdown for the week
        const dailyBreakdown = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            const dayReport = await this.generateDailyReport(day);
            dailyBreakdown.push(dayReport);
        }

        return {
            weekStart: weekKey,
            totalTime,
            productiveTime,
            unproductiveTime,
            neutralTime,
            productivityScore: totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0,
            sites: categorizedSites.sort((a, b) => b.time - a.time),
            dailyBreakdown
        };
    }

    getWebsiteCategory(url) {
        if (!url) return 'neutral';

        const productiveSites = [
            'github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.google.com',
            'medium.com', 'dev.to', 'codepen.io', 'jsfiddle.net', 'codesandbox.io',
            'freecodecamp.org', 'coursera.org', 'udemy.com', 'khan.academy.org',
            'leetcode.com', 'hackerrank.com', 'codecademy.com', 'pluralsight.com',
            'linkedin.com', 'w3schools.com', 'geeksforgeeks.org'
        ];

        const unproductiveSites = [
            'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'snapchat.com',
            'reddit.com', 'youtube.com', 'netflix.com', 'hulu.com', 'twitch.tv',
            'pinterest.com', 'tumblr.com', 'discord.com', 'whatsapp.com', 'telegram.org'
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
}

// Initialize the tracker
const tracker = new ProductivityTracker();

// Make report functions available to other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getDailyReport') {
        tracker.generateDailyReport(request.date ? new Date(request.date) : new Date())
            .then(sendResponse);
        return true;
    }
    
    if (request.action === 'getWeeklyReport') {
        tracker.generateWeeklyReport(request.weekStart ? new Date(request.weekStart) : new Date())
            .then(sendResponse);
        return true;
    }
});