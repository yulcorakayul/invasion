'use strict';
// Prépare une nouvelle version du jeu pour le dépôt public :
//   BLOBDUEL_FILE_KEY=<64 hex> node tools/chiffrer-blobduel.js BlobDuel-X.Y.Z-windows.zip
// → écrit private/blobduel/<nom>.enc et affiche l'empreinte SHA-256 à reporter
//   dans blobduel-download.js (EXPECTED_SHA256) et en bas de la page.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encryptFile } = require('../blobduel-download');
const src = process.argv[2];
const key = process.env.BLOBDUEL_FILE_KEY || '';
if (!src || !fs.existsSync(src)) { console.error('usage : BLOBDUEL_FILE_KEY=… node tools/chiffrer-blobduel.js fichier.zip'); process.exit(1); }
const dst = path.join(__dirname, '..', 'private', 'blobduel', path.basename(src) + '.enc');
fs.mkdirSync(path.dirname(dst), { recursive: true });
encryptFile(src, dst, key);
console.log('chiffré : ' + dst);
console.log('SHA-256 du .zip : ' + crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'));
