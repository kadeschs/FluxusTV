const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const cron = require('node-cron');

class EPGManager {
    constructor() {
        this.epgData = null;
        this.programGuide = new Map();
        this.lastUpdate = null;
        this.isUpdating = false;
        this.CHUNK_SIZE = 10000;
        this.validateAndSetTimezone();
    }

    validateAndSetTimezone() {
        const tzRegex = /^[+-]\d{1,2}:\d{2}$/;
        const timeZone = process.env.TIMEZONE_OFFSET || '+1:00';
        
        if (!tzRegex.test(timeZone)) {
            this.timeZoneOffset = '+1:00';
            return;
        }
        
        this.timeZoneOffset = timeZone;
        const [hours, minutes] = this.timeZoneOffset.substring(1).split(':');
        this.offsetMinutes = (parseInt(hours) * 60 + parseInt(minutes)) * 
                           (this.timeZoneOffset.startsWith('+') ? 1 : -1);
    }

    formatDateIT(date) {
        if (!date) return '';
        const localDate = new Date(date.getTime() + (this.offsetMinutes * 60000));
        return localDate.toLocaleString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\./g, ':');
    }

    parseEPGDate(dateString) {
        if (!dateString) return null;
        try {
            const regex = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/;
            const match = dateString.match(regex);
            
            if (!match) return null;
            
            const [_, year, month, day, hour, minute, second, timezone] = match;
            const tzHours = timezone.substring(0, 3);
            const tzMinutes = timezone.substring(3);
            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${tzHours}:${tzMinutes}`;
            
            const date = new Date(isoString);
            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            console.error('EPG data parsing error:', error);
            return null;
        }
    }

    async initializeEPG(url) {
        if (!this.programGuide.size) {
            await this.startEPGUpdate(url);
        }
        cron.schedule('0 3 * * *', () => this.startEPGUpdate(url));
    }

    async downloadAndProcessEPG(epgUrl) {
        console.log('Download EPG from:', epgUrl.trim());
        try {
            const response = await axios.get(epgUrl.trim(), { 
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            let xmlString;
            try {
                // Try gzip
                xmlString = await gunzip(response.data);
            } catch (gzipError) {
                try {
                    // Try zlib
                    xmlString = zlib.inflateSync(response.data);
                } catch (zlibError) {
                    // If it is not compressed, take directly
                    xmlString = response.data.toString();
                }
            }

            const xmlData = await parseStringPromise(xmlString);
            await this.processEPGInChunks(xmlData);
        } catch (error) {
            console.error(`Error downloading EPG from ${epgUrl}:`, error.message);
            console.error('Error details:', {
                name: error.name,
                code: error.code,
                response: error.response?.data
            });
        }
    }

    async startEPGUpdate(url) {
        if (this.isUpdating) return;
        console.log('\n=== Start of EPG update ===');
        const startTime = Date.now();

        try {
            this.isUpdating = true;
            
            // Supports multiple URLs separated by comma or file
            const epgUrls = typeof url === 'string' && url.includes(',') 
                ? url.split(',').map(u => u.trim()) 
                : await readExternalFile(url);

            // Clean the existing program guide
            this.programGuide.clear();

            // Process each EPG URL sequentially
            for (const epgUrl of epgUrls) {
                await this.downloadAndProcessEPG(epgUrl);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✓ EPG update completed in ${duration} seconds`);
            console.log('=== End of EPG update ===\n');

        } catch (error) {
            console.error('EPG Global Error:', error);
        } finally {
            this.isUpdating = false;
            this.lastUpdate = Date.now();
        }
    }

    async processEPGInChunks(data) {
        if (!data.tv || !data.tv.programme) return;

        const programmes = data.tv.programme;
        
        for (let i = 0; i < programmes.length; i += this.CHUNK_SIZE) {
            const chunk = programmes.slice(i, i + this.CHUNK_SIZE);
            
            for (const programme of chunk) {
                const channelId = programme.$.channel;
                if (!this.programGuide.has(channelId)) {
                    this.programGuide.set(channelId, []);
                }

                const start = this.parseEPGDate(programme.$.start);
                const stop = this.parseEPGDate(programme.$.stop);

                if (!start || !stop) continue;

                const programData = {
                    start,
                    stop,
                    title: programme.title?.[0]?._ || programme.title?.[0]?.$?.text || programme.title?.[0] || 'No title',
                    description: programme.desc?.[0]?._ || programme.desc?.[0]?.$?.text || programme.desc?.[0] || '',
                    category: programme.category?.[0]?._ || programme.category?.[0]?.$?.text || programme.category?.[0] || ''
                };

                this.programGuide.get(channelId).push(programData);
            }
        }

        // Sort programs by each channel
        for (const [channelId, programs] of this.programGuide.entries()) {
            this.programGuide.set(channelId, programs.sort((a, b) => a.start - b.start));
        }
    }

    getCurrentProgram(channelId) {
        const programs = this.programGuide.get(channelId);
        if (!programs?.length) return null;

        const now = new Date();
        const currentProgram = programs.find(program => program.start <= now && program.stop >= now);
        
        if (currentProgram) {
            return {
                ...currentProgram,
                start: this.formatDateIT(currentProgram.start),
                stop: this.formatDateIT(currentProgram.stop)
            };
        }
        
        return null;
    }

    getUpcomingPrograms(channelId) {
        const programs = this.programGuide.get(channelId);
        if (!programs?.length) return [];

        const now = new Date();
        
        return programs
            .filter(program => program.start >= now)
            .slice(0, 2)
            .map(program => ({
                ...program,
                start: this.formatDateIT(program.start),
                stop: this.formatDateIT(program.stop)
            }));
    }

    needsUpdate() {
        if (!this.lastUpdate) return true;
        return (Date.now() - this.lastUpdate) >= (24 * 60 * 60 * 1000);
    }

    isEPGAvailable() {
        return this.programGuide.size > 0 && !this.isUpdating;
    }

    getStatus() {
        return {
            isUpdating: this.isUpdating,
            lastUpdate: this.lastUpdate ? this.formatDateIT(new Date(this.lastUpdate)) : 'Never',
            channelsCount: this.programGuide.size,
            programsCount: Array.from(this.programGuide.values())
                          .reduce((acc, progs) => acc + progs.length, 0),
            timezone: this.timeZoneOffset
        };
    }
}

// Function to read an external file (playlist or EPG)
async function readExternalFile(url) {
    try {
        const response = await axios.get(url);
        const content = response.data;

        // Checks whether the content is a list of URLs
        if (content.includes('http')) {
            return content.split('\n')
                .filter(line => line.trim() !== '' && line.startsWith('http'));
        }

        // If not a list of URLs, return the original URL
        return [url];
    } catch (error) {
        console.error('Error reading external file:', error);
        throw error;
    }
}

module.exports = new EPGManager();
