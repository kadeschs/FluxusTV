const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

// Function to read an external file (playlist or EPG)
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        return response.data.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Error reading external file:', error);
        throw error;
    }
}

// Function to extract EPG URL from M3U playlist
function extractEPGUrl(m3uContent) {
    const firstLine = m3uContent.split('\n')[0];
    if (firstLine.includes('url-tvg=')) {
        const match = firstLine.match(/url-tvg="([^"]+)"/);
        return match ? match[1] : null;
    }
    return null;
}

// Function to parse an M3U playlist
async function parsePlaylist(url) {
    try {
        const playlistUrls = await readExternalFile(url);
        const allItems = [];
        const allGroups = new Set();
        let epgUrl = null;

        for (const playlistUrl of playlistUrls) {
            const m3uResponse = await axios.get(playlistUrl);
            const m3uContent = m3uResponse.data;

            // Extract the EPG URL from the first playlist
            if (!epgUrl) {
                epgUrl = extractEPGUrl(m3uContent);
            }

            // Extract unique groups (genres)
            const groups = new Set();
            const items = [];

            // Divide the playlist into rows
            const lines = m3uContent.split('\n');
            let currentItem = null;

            for (const line of lines) {
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
                    const group = groupMatch ? groupMatch[1] : 'Others';
                    groups.add(group);

                    // Extract the channel name (last part after the comma)
                    const nameParts = metadata.split(',');
                    const name = nameParts[nameParts.length - 1].trim();

                    // Create the channel object
                    currentItem = {
                        name: name,
                        url: '', // It will be set in the next line
                        tvg: {
                            id: tvgData.id || null,
                            name: tvgData.name || name,
                            logo: tvgData.logo || null,
                            chno: tvgData.chno ? parseInt(tvgData.chno, 10) : null
                        },
                        group: group,
                        headers: {
                            'User-Agent': 'HbbTV/1.6.1'
                        }
                    };
                } else if (line.trim().startsWith('http')) {
                    // Set the channel URL
                    if (currentItem) {
                        currentItem.url = line.trim();
                        items.push(currentItem);
                        currentItem = null;
                    }
                }
            }

            // Merge groups and items
            items.forEach(item => {
                if (!allItems.some(existingItem => existingItem.tvg.id === item.tvg.id)) {
                    allItems.push(item);
                }
            });
            groups.forEach(group => allGroups.add(group));
        }

        const uniqueGroups = Array.from(allGroups).sort();
        console.log('Unique groups found in the parser:', uniqueGroups);
        console.log('M3U playlists loaded successfully. Number of channels:', allItems.length);
        
        return { 
            items: allItems, 
            groups: uniqueGroups.map(group => ({
                name: group,
                value: group
            })),
            epgUrl
        };
    } catch (error) {
        console.error('Error parsing playlist:', error);
        throw error;
    }
}

// Function to parse the EPG
async function parseEPG(url) {
    try {
        const epgUrls = await readExternalFile(url);
        const allProgrammes = new Map();

        for (const epgUrl of epgUrls) {
            console.log('Download EPG from:', epgUrl);
            const response = await axios.get(epgUrl, { responseType: 'arraybuffer' });
            const decompressed = await gunzip(response.data);
            const xmlData = await parseStringPromise(decompressed.toString());
            
            const programmes = processEPGData(xmlData);
            programmes.forEach((value, key) => {
                if (!allProgrammes.has(key)) {
                    allProgrammes.set(key, value);
                }
            });
        }

        return allProgrammes;
    } catch (error) {
        console.error('EPG parsing error:', error);
        throw error;
    }
}

// Function for processing EPG data
function processEPGData(data) {
    const programmes = new Map();

    if (!data.tv || !data.tv.programme) {
        return programmes;
    }

    for (const programme of data.tv.programme) {
        const channelId = programme.$.channel;
        if (!programmes.has(channelId)) {
            programmes.set(channelId, []);
        }

        programmes.get(channelId).push({
            start: new Date(programme.$.start),
            stop: new Date(programme.$.stop),
            title: programme.title?.[0]?._,
            description: programme.desc?.[0]?._,
            category: programme.category?.[0]?._
        });
    }

    return programmes;
}

// Function to get channel information from EPG
function getChannelInfo(epgData, channelName) {
    if (!epgData || !channelName) {
        return {
            icon: null,
            description: null
        };
    }

    const channel = epgData.get(channelName);
    if (!channel) {
        return {
            icon: null,
            description: null
        };
    }

    // Find the current program
    const now = new Date();
    const currentProgram = channel.find(program => 
        program.start <= now && program.stop >= now
    );

    return {
        icon: null, // The EPG does not provide icons
        description: currentProgram ? 
            `${currentProgram.title}\n${currentProgram.description || ''}` : 
            null
    };
}

module.exports = {
    parsePlaylist,
    parseEPG,
    getChannelInfo
};
