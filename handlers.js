const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

/**
 * Enriches the channel metadata with EPG information
 */
function enrichWithEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const currentProgram = EPGManager.getCurrentProgram(channelId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(channelId);

    if (currentProgram) {
        // Basic description of the current program
        meta.description = `IN ONDA ORA:\n${currentProgram.title}`;

        if (currentProgram.description) {
            meta.description += `\n${currentProgram.description}`;
        }

        // Add times
        meta.description += `\nOrario: ${currentProgram.start} - ${currentProgram.stop}`;

        // Add category if available
        if (currentProgram.category) {
            meta.description += `\nCategoria: ${currentProgram.category}`;
        }

        // Add upcoming programs
        if (upcomingPrograms && upcomingPrograms.length > 0) {
            meta.description += '\n\nPROSSIMI PROGRAMMI:';
            upcomingPrograms.forEach(program => {
                meta.description += `\n${program.start} - ${program.title}`;
            });
        }

        // Release information
        meta.releaseInfo = `In onda: ${currentProgram.title}`;
    }

    return meta;
}

/**
 * Manages catalog requests
 */
async function catalogHandler({ type, id, extra }) {
    try {
        // Refresh the cache if necessary
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        const { search, genre, skip = 0 } = extra || {};
        const ITEMS_PER_PAGE = 100;

        // Channel filtering
        let channels = [];
        if (genre) {
            channels = cachedData.channels.filter(channel => 
                channel.genre && channel.genre.includes(genre)
            );
        } else if (search) {
            const searchLower = search.toLowerCase();
            channels = cachedData.channels.filter(channel => 
                channel.name.toLowerCase().includes(searchLower)
            );
        } else {
            channels = cachedData.channels;
        }

        // Channel sorting
        channels.sort((a, b) => {
            const numA = parseInt(a.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            const numB = parseInt(b.streamInfo?.tvg?.chno) || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Pagination
        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        // Create meta objects for each channel
        const metas = paginatedChannels.map(channel => {
            const meta = {
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.poster,
                background: channel.background,
                logo: channel.logo,
                description: channel.description || `Channel: ${channel.name}`,
                genre: channel.genre,
                posterShape: channel.posterShape || 'square',
                releaseInfo: 'LIVE',
                behaviorHints: {
                    isLive: true,
                    ...channel.behaviorHints
                }
            };

            // Add channel number information if available
            if (channel.streamInfo?.tvg?.chno) {
                meta.name = `${channel.streamInfo.tvg.chno}. ${channel.name}`;
            }
            
            // Enrich with EPG information
            return enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        });

        return {
            metas,
            genres: cachedData.genres
        };

    } catch (error) {
        console.error('[Handlers] Error in catalog management:', error);
        return { metas: [], genres: [] };
    }
}

/**
 * Handles stream requests
 */
async function streamHandler({ id }) {
    try {
        const channelId = id.split('|')[1];
        const channel = CacheManager.getChannel(channelId);

        if (!channel) {
            return { streams: [] };
        }

        let streams = [];

        // Stream management based on proxy configuration
        if (config.FORCE_PROXY && config.PROXY_URL && config.PROXY_PASSWORD) {
            // Proxy streams only if FORCE_PROXY is active
            const proxyStreams = await ProxyManager.getProxyStreams({
                name: channel.name,
                url: channel.streamInfo.url,
                headers: channel.streamInfo.headers
            });
            streams.push(...proxyStreams);
        } else {
            // Direct stream
            streams.push({
                name: channel.name,
                title: channel.name,
                url: channel.streamInfo.url,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tv"
                }
            });

            // Add proxy streams if configured
            if (config.PROXY_URL && config.PROXY_PASSWORD) {
                const proxyStreams = await ProxyManager.getProxyStreams({
                    name: channel.name,
                    url: channel.streamInfo.url,
                    headers: channel.streamInfo.headers
                });
                streams.push(...proxyStreams);
            }
        }

        // Create basic metadata
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster,
            background: channel.background,
            logo: channel.logo,
            description: channel.description || `Channel: ${channel.name}`,
            genre: channel.genre,
            posterShape: channel.posterShape || 'square',
            releaseInfo: 'LIVE',
            behaviorHints: {
                isLive: true,
                ...channel.behaviorHints
            }
        };

        // Enrich with EPG and add to streams
        const enrichedMeta = enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        streams.forEach(stream => {
            stream.meta = enrichedMeta;
        });

        return { streams };
    } catch (error) {
        console.error('[Handlers] Error loading stream:', error);
        return { 
            streams: [{
                name: 'Errore',
                title: 'Error loading stream',
                url: '',
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: "tv",
                    errorMessage: `Error: ${error.message}`
                }
            }]
        };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
