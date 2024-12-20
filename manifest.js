import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = {
  manifest_version: 3,
  name: 'Monarch / Amazon Sync',
  version: packageJson.version,
  description: packageJson.description,
  permissions: ['storage', 'tabs', 'scripting', 'alarms', 'downloads'],
  host_permissions: [
    'https://amazon.com/*',
    'https://www.amazon.com/*',
    'https://app.monarchmoney.com/*',
    'https://api.monarchmoney.com/*',
  ],
  background: {
    service_worker: 'src/pages/background/index.js',
    type: 'module',
  },
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_icon: 'icon-34.png',
  },
  icons: {
    128: 'icon-128.png',
  },
  content_scripts: [],
  web_accessible_resources: [
    {
      resources: ['assets/js/*.js', 'assets/css/*.css', 'icon-128.png', 'icon-34.png'],
      matches: ['*://*/*'],
    },
  ],
};

export default manifest;
