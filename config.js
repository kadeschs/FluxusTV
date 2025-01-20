const fs = require('fs');
const path = require('path');

// Default base configuration
const baseConfig = {
    // Server configuration
    port: process.env.PORT || 10000,
    
    // Content sources
    M3U_URL: 'https://raw.githubusercontent.com/kadeschs/FluxusTV/refs/heads/main/link.playlist',
    EPG_URL: 'https://raw.githubusercontent.com/kadeschs/FluxusTV/refs/heads/main/link.epg',
    
    // Feature flags
    enableEPG: true, // EPG active by default
    
    // Proxy configuration
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
    
    // Cache settings
    cacheSettings: {
        updateInterval: 12 * 60 * 60 * 1000, // 12 hours
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        retryAttempts: 3,
        retryDelay: 5000 // 5 seconds
    },
    
    // EPG settings
    epgSettings: {
        maxProgramsPerChannel: 50,
        updateInterval: 12 * 60 * 60 * 1000, // 12 hours
        cacheExpiry: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // Manifest configuration
    manifest: {
        id: 'org.kadeschs.fluxustv',
        version: '1.0.0',
        name: 'FluxusTV',
        description: 'An Stremio addon for FluxusTV.',
        logo: 'https://github.com/kadeschs/FluxusTV/blob/main/tv.png?raw=true',
        resources: ['stream', 'catalog', 'meta'],
        types: ['tv'],
        idPrefixes: ['tv'],
        catalogs: [
            {
                type: 'tv',
                id: 'fluxus_tv',
                name: 'FluxusTV', // May want to change this to FluxusTV
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: []
                    },
                    {
                        name: 'search',
                        isRequired: false
                    },
                    {
                        name: 'skip',
                        isRequired: false
                    }
                ]
            }
        ]
    }
};

// Function to load customized configuration
function loadCustomConfig() {
    const configOverridePath = path.join(__dirname, 'addon-config.json');
    
    try {
        // Check if the addon-config.json file exists
        const addonConfigExists = fs.existsSync(configOverridePath);

        // If addon-config.json exists, enable environment variables for M3U and EPG
        if (addonConfigExists) {
            baseConfig.M3U_URL = process.env.M3U_URL || baseConfig.M3U_URL;
            baseConfig.EPG_URL = process.env.EPG_URL || baseConfig.EPG_URL;
        }

        // Load the custom configuration file if it exists
        if (addonConfigExists) {
            const customConfig = JSON.parse(fs.readFileSync(configOverridePath, 'utf8'));
            
            const mergedConfig = {
                ...baseConfig,
                manifest: {
                    ...baseConfig.manifest,
                    id: customConfig.addonId || baseConfig.manifest.id,
                    name: customConfig.addonName || baseConfig.manifest.name,
                    description: customConfig.addonDescription || baseConfig.manifest.description,
                    version: customConfig.addonVersion || baseConfig.manifest.version,
                    logo: customConfig.addonLogo || baseConfig.manifest.logo,
                    catalogs: [{
                        ...baseConfig.manifest.catalogs[0],
                        id: addonConfigExists ? 'omg_plus_tv' : baseConfig.manifest.catalogs[0].id,
                        name: addonConfigExists ? 'OMG+ TV' : baseConfig.manifest.catalogs[0].name
                    }]
                }
            };

            return mergedConfig;
        }
    } catch (error) {
        console.error('Error loading custom configuration:', error);
    }

    return baseConfig;
}

const config = loadCustomConfig();

// Function to update the EPG URL
config.updateEPGUrl = function(url) {
    if (!this.EPG_URL && url) {  // Update only if not already set via environment variables
        this.EPG_URL = url;
    }
};

module.exports = config;
