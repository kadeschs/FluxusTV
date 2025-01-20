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
        // Use tvg-id if available, otherwise generate an ID from the channel name
        const channelId = channel.tvg?.id || channel.name.trim();
        const id = `tv|${channelId}`;
        
        // Use tvg-name if available, otherwise use the original name
        const name = channel.tvg?.name || channel.name;
        
        // Use the group if available, otherwise use "Other channels"
        const group = channel.group || "Other channels";
        
        // Add the genre to the genre list
        this.stremioData.genres.add(group);

        const transformedChannel = {
            id,
            type: 'tv',
            name: name,
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
                    name: name
                }
            }
        };

        return transformedChannel;
    }

    /**
     * Parse M3U playlist
     */
    parseM3U(content) {
        console.log('\n=== Start Parsing Playlist M3U ===');
        const lines = content.split('\n');
        let currentChannel = null;
        
        // Data reset
        this.stremioData.genres.clear();
        this.stremioData.channels = [];

        // Add "Other Channels" manually to the Genre Set
        this.stremioData.genres.add("Other channels");
        
        // Extract the EPG URL from the playlist header
        let epgUrl = null;
        if (lines[0].includes('url-tvg=')) {
            const match = lines[0].match(/url-tvg="([^"]+)"/);
            if (match) {
                epgUrl = match[1];
                console.log('EPG URL found in playlist:', epgUrl);
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
                // Extract channel metadata
                const metadata = line.substring(8).trim();
                const tvgData = {};
                
                // Extract tvg attributes
                const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                tvgMatches.forEach(match => {
                    const [key, value] = match.split('=');
                    const cleanKey = key.replace('tvg-', '');
                    tvgData[cleanKey] = value.replace(/"/g, '');
                });

                // Extract the group
                const groupMatch = metadata.match(/group-title="([^"]+)"/);
                const group = groupMatch ? groupMatch[1] : 'Other channels';

                // Extract the channel name and clean it
                const nameParts = metadata.split(',');
                let name = nameParts[nameParts.length - 1].trim();

                // Check if there are VLC options in the next lines
                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                i = nextIndex - 1; // Update the cycle index

                currentChannel = {
                    name,
                    group,
                    tvg: tvgData,
                    headers: headers
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
        try {
            console.log(`\nLoading playlist from: ${url}`);
            const playlistUrls = await readExternalFile(url);
            const allChannels = [];
            const allGenres = new Set();
            const allEpgUrls = []; // Array to store all EPG URLs

            for (const playlistUrl of playlistUrls) {
                const response = await axios.get(playlistUrl);
                console.log('✓ Playlist downloaded successfully:', playlistUrl);
                
                const result = this.parseM3U(response.data);
                result.channels.forEach(channel => {
                    if (!allChannels.some(existingChannel => existingChannel.id === channel.id)) {
                        allChannels.push(channel);
                    }
                });
                result.genres.forEach(genre => allGenres.add(genre));
                
                // Only add the EPG URL if it isn't already there
                if (result.epgUrl && !allEpgUrls.includes(result.epgUrl)) {
                    allEpgUrls.push(result.epgUrl);
                    console.log('EPG URL found:', result.epgUrl);
                }
            }

            // Merge all found EPG URLs
            const combinedEpgUrl = allEpgUrls.length > 0 ? allEpgUrls.join(',') : null;

            return {
                genres: Array.from(allGenres),
                channels: allChannels,
                epgUrl: combinedEpgUrl
            };
        } catch (error) {
            console.error('Error loading playlist:', error);
            throw error;
        }
    }
}

// Function to read an external file (playlist or EPG)
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        // Check if content starts with #EXTM3U (indicator of a direct M3U playlist)
        if (content.trim().startsWith('#EXTM3U')) {
            console.log('Direct M3U playlist detected');
            return [url]; // Returns an array with just the direct URL
        }

        // Otherwise treat the content as a list of URLs
        console.log('File with URL list detected');
        return content.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Error reading external file:', error);
        throw error;
    }
}

module.exports = PlaylistTransformer;
