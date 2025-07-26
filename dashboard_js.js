class DashboardController {
    constructor() {
        this.charts = {};
        this.currentPeriod = 'today';
        this.currentWeekStart = new Date();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.setupCharts();
    }

    setupEventListeners() {
        // Time period selector
        document.getElementById('time-period').addEventListener('change', (e) => {
            this.currentPeriod = e.target.value;
            this.loadData();
        });

        // Export data
        document.getElementById('export-data').addEventListener('click', () => {
            this.exportData();
        });

        // Week navigation
        document.getElementById('prev-week').addEventListener('click', () => {
            this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
            this.loadWeeklyData();
        });

        document.getElementById('next-week').addEventListener('click', () => {
            this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
            this.loadWeeklyData();
        });

        // Settings
        document.getElementById('idle-time').addEventListener('change', (e) => {
            this.updateIdleThreshold(parseInt(e.target.value) * 1000);
        });

        document.getElementById('add-site').addEventListener('click', () => {
            this.addCustomSite();
        });

        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearAllData();
        });

        document.getElementById('backup-data').addEventListener('click', () => {
            this.backupData();
        });
    }

    async loadData() {
        try {
            let report;
            
            if (this.currentPeriod === 'today') {
                report = await this.getDailyReport();
            } else if (this.currentPeriod === 'week') {
                report = await this.getWeeklyReport();
            } else {
                report = await this.getMonthlyReport();
            }

            this.updateSummaryCards(report);
            this.updateCharts(report);
            this.updateSitesLists(report);
            
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async getDailyReport(date = new Date()) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getDailyReport',
                date: date.toISOString()
            }, resolve);
        });
    }

    async getWeeklyReport(weekStart = new Date()) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getWeeklyReport',
                weekStart: weekStart.toISOString()
            }, resolve);
        });
    }

    async getMonthlyReport() {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        let totalTime = 0;
        let productiveTime = 0;
        let unproductiveTime = 0;
        let neutralTime = 0;
        let allSites = {};

        for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            const dayReport = await this.getDailyReport(new Date(d));
            
            totalTime += dayReport.totalTime;
            productiveTime += dayReport.productiveTime;
            unproductiveTime += dayReport.unproductiveTime;
            neutralTime += dayReport.neutralTime;

            dayReport.sites.forEach(site => {
                allSites[site.url] = (allSites[site.url] || 0) + site.time;
            });
        }

        const sites = Object.entries(allSites).map(([url, time]) => ({
            url,
            time,
            category: this.getWebsiteCategory(url)
        })).sort((a, b) => b.time - a.time);

        return {
            totalTime,
            productiveTime,
            unproductiveTime,
            neutralTime,
            productivityScore: totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0,
            sites
        };
    }

    updateSummaryCards(report) {
        document.getElementById('productive-time').textContent = this.formatTime(report.productiveTime);
        document.getElementById('unproductive-time').textContent = this.formatTime(report.unproductiveTime);
        document.getElementById('neutral-time').textContent = this.formatTime(report.neutralTime);
        document.getElementById('productivity-score').textContent = `${report.productivityScore}%`;

        // Update change indicators (mock data for now)
        document.getElementById('productive-change').textContent = '+5% from yesterday';
        document.getElementById('unproductive-change').textContent = '-3% from yesterday';
        document.getElementById('neutral-change').textContent = '+1% from yesterday';
        document.getElementById('score-change').textContent = '+2% from yesterday';
    }

    setupCharts() {
        // Pie Chart
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        this.charts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['Productive', 'Unproductive', 'Neutral'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: '#f56565'
                }, {
                    label: 'Neutral',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: '#ed8936'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            callback: function(value) {
                                return Math.floor(value / 60) + 'h';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    updateCharts(report) {
        // Update pie chart
        if (this.charts.pie) {
            this.charts.pie.data.datasets[0].data = [
                Math.floor(report.productiveTime / 60),
                Math.floor(report.unproductiveTime / 60),
                Math.floor(report.neutralTime / 60)
            ];
            this.charts.pie.update();
        }

        // Update line chart with last 7 days data
        this.updateLineChart();

        // Update weekly chart if in week view
        if (this.currentPeriod === 'week' && report.dailyBreakdown) {
            this.updateWeeklyChart(report.dailyBreakdown);
        }
    }

    async updateLineChart() {
        const labels = [];
        const data = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            const dayReport = await this.getDailyReport(date);
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
            data.push(dayReport.productivityScore);
        }

        if (this.charts.line) {
            this.charts.line.data.labels = labels;
            this.charts.line.data.datasets[0].data = data;
            this.charts.line.update();
        }
    }

    updateWeeklyChart(dailyBreakdown) {
        if (!this.charts.weekly || !dailyBreakdown) return;

        const productiveData = [];
        const unproductiveData = [];
        const neutralData = [];

        dailyBreakdown.forEach(day => {
            productiveData.push(Math.floor(day.productiveTime / 60));
            unproductiveData.push(Math.floor(day.unproductiveTime / 60));
            neutralData.push(Math.floor(day.neutralTime / 60));
        });

        this.charts.weekly.data.datasets[0].data = productiveData;
        this.charts.weekly.data.datasets[1].data = unproductiveData;
        this.charts.weekly.data.datasets[2].data = neutralData;
        this.charts.weekly.update();

        // Update weekly insights
        this.updateWeeklyInsights(dailyBreakdown);
    }

    updateWeeklyInsights(dailyBreakdown) {
        if (!dailyBreakdown) return;

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let bestDay = { score: -1, name: '' };
        let worstDay = { score: 101, name: '' };
        let totalScore = 0;

        dailyBreakdown.forEach((day, index) => {
            if (day.productivityScore > bestDay.score) {
                bestDay = { score: day.productivityScore, name: days[index] };
            }
            if (day.productivityScore < worstDay.score) {
                worstDay = { score: day.productivityScore, name: days[index] };
            }
            totalScore += day.productivityScore;
        });

        const avgScore = Math.round(totalScore / dailyBreakdown.length);

        document.getElementById('best-day').textContent = bestDay.name;
        document.getElementById('worst-day').textContent = worstDay.name;
        document.getElementById('avg-score').textContent = `${avgScore}%`;
    }

    updateSitesLists(report) {
        // Most productive sites
        const productiveSites = report.sites
            .filter(site => site.category === 'productive')
            .slice(0, 5);

        const productiveContainer = document.getElementById('productive-sites');
        if (productiveSites.length === 0) {
            productiveContainer.innerHTML = '<div class="site-item"><div class="site-info"><span class="site-name">No productive sites yet</span></div><div class="site-time">0m</div></div>';
        } else {
            productiveContainer.innerHTML = productiveSites.map(site => `
                <div class="site-item">
                    <div class="site-info">
                        <span class="site-name">${site.url}</span>
                        <span class="site-category">${site.category}</span>
                    </div>
                    <div class="site-time">${this.formatTime(site.time)}</div>
                </div>
            `).join('');
        }

        // Most time spent sites
        const mostTimeContainer = document.getElementById('most-time-sites');
        const topSites = report.sites.slice(0, 5);
        
        if (topSites.length === 0) {
            mostTimeContainer.innerHTML = '<div class="site-item"><div class="site-info"><span class="site-name">No data available</span></div><div class="site-time">0m</div></div>';
        } else {
            mostTimeContainer.innerHTML = topSites.map(site => `
                <div class="site-item">
                    <div class="site-info">
                        <span class="site-name">${site.url}</span>
                        <span class="site-category">${site.category}</span>
                    </div>
                    <div class="site-time">${this.formatTime(site.time)}</div>
                </div>
            `).join('');
        }
    }

    async loadWeeklyData() {
        const weekReport = await this.getWeeklyReport(this.currentWeekStart);
        this.updateWeeklyChart(weekReport.dailyBreakdown);
        
        // Update week display
        const weekEnd = new Date(this.currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        document.getElementById('current-week').textContent = 
            `${this.currentWeekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
    }

    async exportData() {
        try {
            const allData = await chrome.storage.local.get(null);
            const dataStr = JSON.stringify(allData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `productivity-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('Data exported successfully!');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    }

    async updateIdleThreshold(threshold) {
        await chrome.storage.local.set({
            idleThreshold: threshold
        });
        
        // Update all content scripts
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateIdleThreshold',
                threshold: threshold
            }).catch(() => {
                // Ignore errors for tabs that can't receive messages
            });
        });
    }

    async addCustomSite() {
        const url = document.getElementById('site-url').value.trim();
        const category = document.getElementById('site-category').value;
        
        if (!url) {
            alert('Please enter a website URL');
            return;
        }

        const result = await chrome.storage.local.get(['customSites']);
        const customSites = result.customSites || {};
        
        customSites[url] = category;
        await chrome.storage.local.set({ customSites });
        
        document.getElementById('site-url').value = '';
        alert(`Added ${url} as ${category} site`);
    }

    async clearAllData() {
        if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            return;
        }

        await chrome.storage.local.clear();
        await chrome.storage.local.set({
            initialized: true,
            settings: {
                trackingEnabled: true,
                idleTime: 30000,
                excludedSites: []
            }
        });

        alert('All data cleared successfully!');
        location.reload();
    }

    async backupData() {
        try {
            const allData = await chrome.storage.local.get(null);
            await chrome.storage.local.set({
                backup: {
                    data: allData,
                    timestamp: Date.now()
                }
            });
            
            alert('Data backed up successfully!');
        } catch (error) {
            console.error('Backup failed:', error);
            alert('Backup failed. Please try again.');
        }
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

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
});: ['#48bb78', '#f56565', '#ed8936'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });

        // Line Chart
        const lineCtx = document.getElementById('lineChart').getContext('2d');
        this.charts.line = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Productivity Score',
                    data: [],
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        // Weekly Chart
        const weeklyCtx = document.getElementById('weeklyChart').getContext('2d');
        this.charts.weekly = new Chart(weeklyCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Productive',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: '#48bb78'
                }, {
                    label: 'Unproductive',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor