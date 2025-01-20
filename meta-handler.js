const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');

/**
 * Enrichs channel metadata with detailed EPG information
 */
function enrichWithDetailedEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const currentProgram = EPGManager.getCurrentProgram(channelId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(channelId);

    if (currentProgram) {
        // Create the basic description
        let description = [];
        
        // Current program
        description.push('📺 ON AIR NOW:', currentProgram.title);
        
        if (currentProgram.description) {
            description.push('', currentProgram.description);
        }

        description.push('', `⏰ ${currentProgram.start} - ${currentProgram.stop}`);

        if (currentProgram.category) {
            description.push(`🏷️ ${currentProgram.category}`);
        }

        // Upcoming programs
        if (upcomingPrograms?.length > 0) {
            description.push('', '📅 UPCOMING PROGRAMS:');
            upcomingPrograms.forEach(program => {
                description.push(
                    '',
                    `• ${program.start} - ${program.title}`
                );
                if (program.description) {
                    description.push(`  ${program.description}`);
                }
                if (program.category) {
                    description.push(`  🏷️ ${program.category}`);
                }
            });
        }

        // Merge everything with the original description
        meta.description = description.join('\n');
        
        // Update releaseInfo
        meta.releaseInfo = `${currentProgram.title} (${currentProgram.start})`;
    }

    return meta;
}

/**
 * Handler for detailed metadata of a channel
 */
async function metaHandler({ type, id }) {
    try {
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const channelId = id.split('|')[1];
        const allChannels = CacheManager.getCachedData().channels;
        
        const channel = allChannels.find(ch => 
            ch.id === id || 
            ch.streamInfo?.tvg?.id === channelId ||
            ch.name === channelId
        );

        if (!channel) {
            return { meta: null };
        }

        // Prepare basic channel information
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.streamInfo?.tvg?.chno 
                ? `${channel.streamInfo.tvg.chno}. ${channel.name}`
                : channel.name,
            poster: channel.poster || channel.logo,
            background: channel.background || channel.logo,
            logo: channel.logo,
            description: '',
            releaseInfo: 'LIVE',
            genre: channel.genre,
            posterShape: 'square',
            language: 'eng',
            country: 'USA',
            isFree: true,
            behaviorHints: {
                isLive: true,
                defaultVideoId: channel.id
            }
        };

        // Prepare the basic description
        let baseDescription = [];
        
        if (channel.streamInfo?.tvg?.chno) {
            baseDescription.push(`📺 Channel ${channel.streamInfo.tvg.chno}`);
        }

        if (channel.description) {
            baseDescription.push('', channel.description);
        }

        meta.description = baseDescription.join('\n');

        // Enrich with EPG information
        const enrichedMeta = enrichWithDetailedEPG(meta, channel.streamInfo?.tvg?.id);

        return { meta: enrichedMeta };
    } catch (error) {
        console.error('[MetaHandler] Error:', error.message);
        return { meta: null };
    }
}

module.exports = metaHandler;
