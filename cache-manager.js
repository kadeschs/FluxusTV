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

        this.cache.updateInProgress = true;
        console.log('\n=== Start Cache Update ===');

        try {
            const needsUpdate =
                force ||
                !this.cache.lastUpdated ||
                (Date.now() - this.cache.lastUpdated) > this.config.cacheSettings.updateInterval;

            if (!needsUpdate) {
                console.log('ℹ️  Cache still valid, skip update.');
                this.cache.updateInProgress = false;
                return;
            }

            console.log('Loading playlist from:', this.config.M3U_URL);

            let stremioData = null;

            try {
                // SAFE: load playlist with full error handling
                stremioData = await this.transformer.loadAndTransform(this.config.M3U_URL);
            } catch (err) {
                console.error('❌ Playlist fetch failed:', err.message);

                // SAFE FALLBACK: empty dataset instead of crashing
                stremioData = {
                    channels: [],
                    genres: []
                };
            }

            // Update cache safely
            this.cache = {
                stremioData,
                lastUpdated: Date.now(),
                updateInProgress: false
            };

            // Update manifest genres safely
            if (this.config.manifest?.catalogs?.[0]?.extra?.[0]) {
                this.config.manifest.catalogs[0].extra[0].options = stremioData.genres;
            }

            console.log('\nCache Summary:');
            console.log(`✓ Cached channels: ${stremioData.channels.length}`);
            console.log(`✓ Genres found: ${stremioData.genres.length}`);
            console.log(`✓ Latest update: ${new Date().toLocaleString()}`);
            console.log('\n=== Cache Updated Successfully ===\n');

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERROR in cache update:', error.message);

            // NEVER crash the app
            this.cache.updateInProgress = false;

            // Emit error but DO NOT throw
            this.emit('cacheError', error);

        } finally {
            this.cache.updateInProgress = false;
        }
    }

    getCachedData() {
        if (!this.cache.stremioData) {
            return { channels: [], genres: [] };
        }

        return {
            channels: this.cache.stremioData.channels,
            genres: this.cache.stremioData.genres
        };
    }

    getChannel(channelId) {
        console.log('[CacheManager] Channel search with ID:', channelId);

        const channel = this.cache.stremioData?.channels.find(ch => {
            const match = ch.id === `tv|${channelId}`;
            if (match) console.log('[CacheManager] Match found by channel:', ch.name);
            return match;
        });

        if (!channel) {
            console.log('[CacheManager] No channels found for ID:', channelId);
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
