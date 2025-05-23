// bump-version.js
const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Bump versionCode
const currentCode = appJson.expo.android?.versionCode || 1;
appJson.expo.android = {
  ...appJson.expo.android,
  versionCode: currentCode + 1,
};

// Optional: bump versionName like 1.0.0 → 1.0.1
const currentVersion = appJson.expo.version || '1.0.0';
const parts = currentVersion.split('.');
const patch = parseInt(parts[2] || '0', 10) + 1;
appJson.expo.version = `${parts[0]}.${parts[1]}.${patch}`;

// Save changes
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
console.log(`✅ Bumped to versionCode ${appJson.expo.android.versionCode} and version ${appJson.expo.version}`);
