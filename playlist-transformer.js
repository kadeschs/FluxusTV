const axios = require('axios');

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
    }

    /**
     * Extracts headers from VLC options
     */
    parseVLCOpts(lines, currentIndex) {
        const headers = {};
        let i = currentIndex;

        while (i < lines.length && lines[i].startsWith('#EXTVLCOPT:')) {
            const opt = lines[i].substring('#EXTVLCOPT:'.length).trim();
            if (opt.startsWith('http-user-agent=')) {
                headers['User-Agent'] = opt.substring('http-user-agent='.length);
            }
            i++;
        }

        return { headers, nextIndex: i };
    }

    /**
     * Converts a channel to Stremio format
     */
    transformChannelToStremio(channel) {
        const channelId = channel.tvg?.id || channel.name.trim();
        const id = `tv|${channelId}`;
        const name = channel.tvg?.name || channel.name;
        const group = channel.group || "Other channels";

        this.stremioData.genres.add(group);

        return {
            id,
            type: 'tv',
            name,
            genre: [group],
            posterShape: 'square',
            poster: channel.tvg?.logo,
            background: channel.tvg?.logo,
            logo: channel.tvg?.logo,
            description: `Channel: ${name}`,
            runtime: 'LIVE',
            behaviorHints: {
                defaultVideoId: id,
                isLive: true
            },
            streamInfo: {
                url: channel.url,
                headers: channel.headers,
                tvg: {
                    ...channel.tvg,
                    id: channelId,
                    name
                }
            }
        };
    }

    /**
     * Parse M3U playlist
     */
    parseM3U(content) {
        console.log('\n=== Start Parsing Playlist M3U ===');

        if (!content || typeof content !== 'string') {
            console.error('❌ Invalid playlist content');
            return { genres: [], channels: [], epgUrl: null };
        }

        const lines = content.split('\n');
        let currentChannel = null;

        this.stremioData.genres.clear();
        this.stremioData.channels = [];
        this.stremioData.genres.add("Other channels");

        let epgUrl = null;
        if (lines[0]?.includes('url-tvg=')) {
            const match = lines[0].match(/url-tvg="([^"]+)"/);
            if (match) {
                epgUrl = match[1];
                console.log('EPG URL found in playlist:', epgUrl);
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF:')) {
                const metadata = line.substring(8).trim();
                const tvgData = {};

                const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                tvgMatches.forEach(match => {
                    const [key, value] = match.split('=');
                    const cleanKey = key.replace('tvg-', '');
                    tvgData[cleanKey] = value.replace(/"/g, '');
                });

                const groupMatch = metadata.match(/group-title="([^"]+)"/);
                const group = groupMatch ? groupMatch[1] : 'Other channels';

                const nameParts = metadata.split(',');
                let name = nameParts[nameParts.length - 1].trim();

                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                i = nextIndex - 1;

                currentChannel = {
                    name,
                    group,
                    tvg: tvgData,
                    headers
                };

            } else if (line.startsWith('http')) {
                if (currentChannel) {
                    currentChannel.url = line;
                    this.stremioData.channels.push(
                        this.transformChannelToStremio(currentChannel)
                    );
                    currentChannel = null;
                }
            }
        }

        const result = {
            genres: Array.from(this.stremioData.genres),
            channels: this.stremioData.channels,
            epgUrl
        };

        console.log(`[PlaylistTransformer] ✓ Channels processed: ${result.channels.length}`);
        console.log(`[PlaylistTransformer] ✓ Genres found: ${result.genres.length}`);
        console.log('=== Finished Parsing Playlist M3U ===\n');

        return result;
    }

    /**
     * Load and transform a playlist from URL
     */
    async loadAndTransform(url) {
        console.log(`\nLoading playlist from: ${url}`);

        let playlistUrls = [];

        try {
            playlistUrls = await readExternalFile(url);
        } catch (err) {
            console.error('❌ Failed to read playlist list file:', err.message);
            return { genres: [], channels: [], epgUrl: null };
        }

        const allChannels = [];
        const allGenres = new Set();
        const allEpgUrls = [];

        for (const playlistUrl of playlistUrls) {
            try {
                const response = await axios.get(playlistUrl);
                console.log('✓ Playlist downloaded successfully:', playlistUrl);

                const result = this.parseM3U(response.data);

                result.channels.forEach(channel => {
                    if (!allChannels.some(existing => existing.id === channel.id)) {
                        allChannels.push(channel);
                    }
                });

                result.genres.forEach(g => allGenres.add(g));

                if (result.epgUrl && !allEpgUrls.includes(result.epgUrl)) {
                    allEpgUrls.push(result.epgUrl);
                }

            } catch (err) {
                console.error(`❌ Failed to download playlist: ${playlistUrl}`);
                console.error('Reason:', err.message);
                continue; // SAFE: skip bad playlist, keep app alive
            }
        }

        return {
            genres: Array.from(allGenres),
            channels: allChannels,
            epgUrl: allEpgUrls.length > 0 ? allEpgUrls.join(',') : null
        };
    }
}

/**
 * Read external file (playlist or list of playlist URLs)
 */
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        if (typeof content === 'string' && content.trim().startsWith('#EXTM3U')) {
            console.log('Direct M3U playlist detected');
            return [url];
        }

        console.log('File with URL list detected');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

    } catch (err) {
        console.error('❌ Error reading external file:', err.message);
        return []; // SAFE: return empty list instead of throwing
    }
}

module.exports = PlaylistTransformer;
