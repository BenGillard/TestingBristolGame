TestingBristolGame/
├── public/
│   ├── manifest.json         # Defines PWA characteristics and aesthetics (icons, splash screen)
│   ├── sw.js                 # Service Worker for offline asset caching
│   └── assets/               # Local images, custom collectible icons
├── src/
│   ├── main.ts               # Core app initialization & map rendering
│   ├── mapManager.ts         # Handles Leaflet layers, geofences, and zoom caps
│   ├── gameLogic.ts          # Crafting/merging algorithms, item tiering math
│   └── supabaseClient.ts     # Connection settings for data syncing
├── index.html                # Entry point
└── package.json              # Vite & TypeScript dependencies
