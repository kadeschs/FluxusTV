const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');
const config = require('./config');

async function generateConfig() {
    try {
        console.log('\n=== Initial Configuration Generation ===');
        
        // Create an instance of the transformer
        const transformer = new PlaylistTransformer();
        
        // Load and transform the playlist using the URL from the configuration
        const data = await transformer.loadAndTransform(config.M3U_URL);
        console.log(`Found ${data.genres.length} genres`);
        console.log('EPG Configured URL:', config.EPG_URL);

        // Create the final configuration
        const finalConfig = {
            ...config,
            manifest: {
                ...config.manifest,
                catalogs: [
                    {
                        ...config.manifest.catalogs[0],
                        extra: [
                            {
                                name: 'genre',
                                isRequired: false,
                                options: data.genres
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

        console.log('Configuration generated with the following genres:');
        console.log(data.genres.join(', '));
        if (config.enableEPG) {
            console.log('EPG enabled, URL:', config.EPG_URL);
        } else {
            console.log('EPG disabled');
        }
        console.log('\n=== End of Configuration Generation ===\n');

        return finalConfig;
    } catch (error) {
        console.error('Error generating configuration:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        // Generate the configuration dynamically
        const generatedConfig = await generateConfig();

        // Create the addon
        const builder = new addonBuilder(generatedConfig.manifest);

        // Define routes
        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        // Initialize the cache manager
        const CacheManager = require('./cache-manager')(generatedConfig);

        // Update cache on startup
        await CacheManager.updateCache(true).catch(error => {
            console.error('Error updating cache on startup:', error);
        });

        // Customize the HTML page
        const landingTemplate = landing => `
<!DOCTYPE html>
<html style="background: #000">
<head>
    <meta charset="utf-8">
    <title>${landing.name} - Stremio Addon</title>
    <style>
        body {
            background: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 { color: #fff; }
        .logo {
            width: 150px;
            margin: 0 auto;
            display: block;
        }
        button {
            border: 0;
            outline: 0;
            color: #fff;
            background: #8A5AAB;
            padding: 13px 30px;
            margin: 20px 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            border-radius: 5px;
        }
        button:hover {
            background: #9B6BC3;
        }
        .footer {
            margin-top: 50px;
            font-size: 14px;
            color: #666;
        }
        .footer a {
            color: #8A5AAB;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
    <script>
        function copyManifestLink() {
            const manifestUrl = window.location.href + 'manifest.json';
            navigator.clipboard.writeText(manifestUrl).then(() => {
                alert('Manifest link copied to clipboard!');
            });
        }
    </script>
</head>
<body>
    <img class="logo" src="${landing.logo}" />
    <h1 style="color: white">${landing.name}</h1>
    <h2 style="color: white">${landing.description}</h2>
    <button onclick="window.location = 'stremio://${landing.transportUrl}/manifest.json'">
        Add to Stremio
    </button>
</body>
</html>`;

        // Create and start the server
        const addonInterface = builder.getInterface();
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

        // Start the server first
        await serveHTTP(addonInterface, { 
            port: generatedConfig.port, 
            landingTemplate 
        });
        
        console.log('Addon active on:', `http://localhost:${generatedConfig.port}`);
        console.log('Add the following URL to Stremio:', `http://localhost:${generatedConfig.port}/manifest.json`);

        // Initialize EPG after server startup if enabled
        if (generatedConfig.enableEPG) {
            await EPGManager.initializeEPG(generatedConfig.EPG_URL);
        } else {
            console.log('EPG disabled, skip initialization');
        }

    } catch (error) {
        console.error('Failed to start addon:', error);
        process.exit(1);
    }
}

// Start the addon
startAddon();
