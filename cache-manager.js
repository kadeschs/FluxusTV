const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.transformer = new PlaylistTransformer();
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false
        };
    }

    async updateCache(force = false) {
        if (this.cache.updateInProgress) {
            console.log('⚠️  Cache update already in progress, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Start Cache Update ===');

            const needsUpdate = force || !this.cache.lastUpdated || 
                (Date.now() - this.cache.lastUpdated) > this.config.cacheSettings.updateInterval;

            if (!needsUpdate) {
                console.log('ℹ️  Cache still valid, skip update.');
                return;
            }

            // Load and transform the playlist
            console.log('Loading playlist from:', this.config.M3U_URL);
            const stremioData = await this.transformer.loadAndTransform(this.config.M3U_URL);
            
            // Refresh the cache
            this.cache = {
                stremioData,
                lastUpdated: Date.now(),
                updateInProgress: false
            };

            // Update the genres in the manifest
            this.config.manifest.catalogs[0].extra[0].options = stremioData.genres;

            console.log('\nCache Summary:');
            console.log(`✓ Cached channels: ${stremioData.channels.length}`);
            console.log(`✓ Genres found: ${stremioData.genres.length}`);
            console.log(`✓ Latest update: ${new Date().toLocaleString()}`);
            console.log('\n=== Cache Updated Successfully ===\n');

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERROR in\'cache update:', error);
            this.cache.updateInProgress = false;
            this.emit('cacheError', error);
            throw error;
        }
    }

    getCachedData() {
        if (!this.cache.stremioData) return { channels: [], genres: [] };
        
        return {
            channels: this.cache.stremioData.channels,
            genres: this.cache.stremioData.genres
        };
    }

    getChannel(channelId) {
        console.log('[CacheManager] Channel search with ID:', channelId);
        const channel = this.cache.stremioData?.channels.find(ch => {
            const match = ch.id === `tv|${channelId}`;
            if (match) {
                console.log('[CacheManager] Match found by channel:', ch.name);
            }
            return match;
        });

        if (!channel) {
            console.log('[CacheManager] No channels found for ID:', channelId);
            // Try searching by name if searching by ID fails
            return this.cache.stremioData?.channels.find(ch => ch.name === channelId);
        }

        return channel;
    }

    getChannelsByGenre(genre) {
        if (!genre) return this.cache.stremioData?.channels || [];
        return this.cache.stremioData?.channels.filter(
            channel => channel.genre?.includes(genre)
        ) || [];
    }

    searchChannels(query) {
        if (!query) return this.cache.stremioData?.channels || [];
        const searchLower = query.toLowerCase();
        return this.cache.stremioData?.channels.filter(channel => 
            channel.name.toLowerCase().includes(searchLower)
        ) || [];
    }

    isStale() {
        if (!this.cache.lastUpdated) return true;
        return (Date.now() - this.cache.lastUpdated) >= this.config.cacheSettings.updateInterval;
    }
}

module.exports = config => new CacheManager(config);
