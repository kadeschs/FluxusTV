const axios = require('axios');
const { URL } = require('url');

class ProxyManager {
    constructor(config) {
        this.config = config;
        this.proxyCache = new Map();
        this.lastCheck = new Map();
    }

    async validateProxyUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    async checkProxyHealth(proxyUrl) {
        try {
            const response = await axios.head(proxyUrl, {
                timeout: 5000,
                validateStatus: status => status === 200 || status === 302
            });
            return response.status === 200 || response.status === 302;
        } catch {
            return false;
        }
    }

    buildProxyUrl(streamUrl, userAgent) {
        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return null;
        }

        const params = new URLSearchParams({
            api_password: this.config.PROXY_PASSWORD,
            d: streamUrl
        });

        // Add the User-Agent to the request
        if (userAgent) {
            params.append('h_User-Agent', userAgent);
        }

        return `${this.config.PROXY_URL}/proxy/hls/manifest.m3u8?${params.toString()}`;
    }

    async getProxyStreams(channel) {
        const streams = [];
        const userAgent = channel.headers?.['User-Agent'] || 'HbbTV/1.6.1';

        // If the proxy is not configured, return an empty array
        if (!this.config.PROXY_URL || !this.config.PROXY_PASSWORD) {
            return streams;
        }

        try {
            const proxyUrl = this.buildProxyUrl(channel.url, userAgent);

            // Check the cache
            const cacheKey = `${channel.name}_${proxyUrl}`;
            const lastCheck = this.lastCheck.get(cacheKey);
            const cacheValid = lastCheck && (Date.now() - lastCheck) < 5 * 60 * 1000; // 5 minute cache

            if (cacheValid && this.proxyCache.has(cacheKey)) {
                return [this.proxyCache.get(cacheKey)];
            }

            // Check if the proxy is active
            if (!await this.checkProxyHealth(proxyUrl)) {
                console.log('Proxy not active for:', channel.name);
                return []; // Don't add the error flow
            }

            const proxyStream = {
                name: `${channel.name} (Proxy)`,
                title: `${channel.name} (Proxy HLS)`,
                url: proxyUrl,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tv"
                }
            };

            // Refresh the cache
            this.proxyCache.set(cacheKey, proxyStream);
            this.lastCheck.set(cacheKey, Date.now());

            streams.push(proxyStream);
        } catch (error) {
            console.error('Proxy error for channel:', channel.name, error.message);
            console.error('Requested URL:', proxyUrl);
            console.error('User-Agent:', userAgent);
        }

        return streams;
    }
}

module.exports = ProxyManager;
