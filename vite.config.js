const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('vite');

const root = __dirname;
const publicFiles = [
  'manifest.json',
  'sw.js',
  'icons/app-icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

function copyPwaFiles() {
  return {
    name: 'copy-pwa-files',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/href="\.\/assets\/manifest-[^"]+\.json"/, 'href="./manifest.json"')
          .replace(/href="\.\/assets\/icon-192-[^"]+\.png"/g, 'href="./icons/icon-192.png"');
      },
    },
    closeBundle() {
      const outputDir = path.join(root, 'dist');
      publicFiles.forEach((relativePath) => {
        const source = path.join(root, relativePath);
        const target = path.join(outputDir, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      });
      const indexPath = path.join(outputDir, 'index.html');
      const indexHtml = fs.readFileSync(indexPath, 'utf8')
        .replace(/href="\.\/assets\/manifest-[^"]+\.json"/, 'href="./manifest.json"')
        .replace(/href="\.\/assets\/icon-192-[^"]+\.png"/g, 'href="./icons/icon-192.png"');
      fs.writeFileSync(indexPath, indexHtml);
    },
  };
}

module.exports = defineConfig({
  base: './',
  publicDir: false,
  plugins: [copyPwaFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
