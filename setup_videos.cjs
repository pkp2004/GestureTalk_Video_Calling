const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

// Move folders to public if they are not already there
const dirsToScan = ['demo_dataset'];
dirsToScan.forEach(part => {
    const srcPath = path.join(rootDir, part);
    const destPath = path.join(publicDir, part);
    
    if (fs.existsSync(srcPath)) {
        console.log(`Moving ${part} to public/...`);
        fs.renameSync(srcPath, destPath);
    }
});

const map = {};

// Scan and map
dirsToScan.forEach(part => {
    const dir = path.join(publicDir, part);
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            if (file.endsWith('.mp4')) {
                // Name processing
                let rawName = file.replace('.mp4', '').toLowerCase();
                
                // Remove trailing tags like "_1_BDBF..." or "-1", "-2" to get the raw word
                // E.g. "rain-1.mp4" -> "rain", "self help_1_FAC..." -> "self help"
                let baseName = rawName.replace(/_[_\w\d]{10,}$/g, '') // remove hash suffixes
                                     .replace(/-\d+$/, '');           // remove -1, -2 suffixes
                
                // Remove weird brackets or hyphens, keep valid words
                let cleanWord = baseName.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                
                if (cleanWord) {
                    // Only map if it doesn't already exist, or just overwrite
                    // E.g., rain-1 might set 'rain'. Next time 'rain' comes from rain-2, we just keep the first or overwrite.
                    if (!map[cleanWord]) {
                        map[cleanWord] = `/${part}/${file}`;
                    }
                }
            }
        });
    }
});

const content = `export const videoMap = ${JSON.stringify(map, null, 2)};\n`;
fs.writeFileSync(path.join(rootDir, 'src', 'videoMap.js'), content);
console.log('Successfully created src/videoMap.js with ' + Object.keys(map).length + ' words mapped!');
