# Sécurité du site tdinvasion.com

Ce fichier n'est jamais servi par le site (seules les extensions web connues le sont).

## Ce que fait le serveur

| Protection | Où |
|---|---|
| Fichiers servis en **liste blanche** : extensions web connues uniquement ; jamais `server.js`, `security.js`, `package.json`, `.git`, `.env`, `private/`, `tests/`, `tools/`, `node_modules/` | `security.js` |
| Adresses **canonisées** avant tout traitement (`%61dmin.html`, `//blobduel/`… redirigés) : impossible de contourner les en-têtes d'une page ou de sortir du dossier du site | `security.js` |
| En-têtes : `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` partout ; CSP stricte + interdiction d'intégration sur `/blobduel/` et `/admin.html` (INVASION reste intégrable pour CrazyGames) | `security.js` |
| Scripts externes d'`admin.html` et de `battle/` en **version figée avec empreinte SRI** (un CDN piraté ne peut pas injecter de code) | HTML |
| Limite de **600 requêtes / minute / adresse** ; délais contre les connexions lentes | `security.js` |
| WebSocket `/battle/ws` : origine vérifiée, messages ≤ 4 Ko, 60 messages / s, 6 connexions / adresse, 300 au total, noms nettoyés, nombres vérifiés | `server.js` |
| Adresses IP **jamais stockées** : compteurs indexés par une empreinte HMAC salée, clé renouvelée chaque jour, en mémoire | `security.js` |
| Adresse du visiteur = **dernière** valeur de `X-Forwarded-For` (celle posée par le proxy de Railway) : les valeurs inventées par le visiteur sont ignorées | `security.js` |

## Téléchargement de BLOB DUEL

Le dépôt GitHub est **public** : le jeu n'y est stocké que **chiffré** (AES-256-GCM,
`private/blobduel/*.zip.enc`). Le serveur le déchiffre au démarrage avec une clé gardée
dans Railway, vérifie son empreinte SHA-256, et ne l'envoie qu'après ces contrôles :

1. **code d'accès** (un par ami, révocable) — 5 erreurs → blocage 15 min ; les essais
   envoyés en parallèle sont comptés d'avance ;
2. **4 envois simultanés** au plus, coupés après 15 min ;
3. **200 téléchargements par jour** au total ;
4. **5 téléchargements par jour et par adresse**.

### Variables Railway (onglet *Variables* du service)

| Variable | Valeur | Obligatoire |
|---|---|---|
| `BLOBDUEL_FILE_KEY` | clé de déchiffrement (64 caractères hexadécimaux) | oui |
| `BLOBDUEL_ACCESS_CODE` | codes d'accès séparés par des virgules, ex. `K7Q2-M9XD-4T8B,…` | oui (sans code, le téléchargement est fermé) |
| `BLOBDUEL_MAX_PER_IP` | 5 par défaut | non |
| `BLOBDUEL_MAX_PER_DAY` | 200 par défaut | non |
| `BLOBDUEL_MAX_CONCURRENT` | 4 par défaut | non |
| `BLOBDUEL_PUBLIC` | `1` pour ouvrir le téléchargement à tous sans code | non |
| `WS_EXTRA_ORIGINS` | autres domaines autorisés pour `/battle/ws` | non |
| `CLIENT_IP_HEADER` | autre en-tête d'adresse posé par l'hébergeur | non |

**Retirer l'accès à un ami** : supprimer son code de `BLOBDUEL_ACCESS_CODE` (Railway redémarre le service).

**Ne jamais** mettre ces valeurs dans le dépôt, dans un ticket ou sur Discord.

### Publier une nouvelle version du jeu

```
BLOBDUEL_FILE_KEY=<clé> node tools/chiffrer-blobduel.js BlobDuel-X.Y.Z-windows.zip
```
puis reporter la version et l'empreinte affichée dans `blobduel-download.js`
(`VERSION`, `EXPECTED_SHA256`) et en bas de `blobduel/index.html`. Ne jamais commiter le `.zip` en clair.

## Tests

`npm test` : fichiers secrets jamais servis (y compris encodages détournés), pages
d'INVASION intactes, en-têtes, code d'accès, essais en parallèle, `X-Forwarded-For`
inventé, limites par adresse / par jour / simultanées, client qui ne lit plus,
intégrité du fichier déchiffré, WebSocket (origine, débit, taille).

## Limites connues

- **La version 0.7.0** (non chiffrée) reste dans l'historique Git public : elle a été
  publiée avant cette protection.
- `admin.html` charge Tailwind depuis son CDN, qui ne permet pas d'empreinte SRI. Le
  mot de passe d'administration est vérifié par le serveur `invasion-server` (dépôt
  séparé, non relu ici) : il doit limiter les essais de connexion.
- Les limites sont en mémoire : un redémarrage du serveur les remet à zéro.
- Un code d'accès partagé par un ami permet à d'autres de télécharger, dans la limite
  des quotas : il suffit alors de révoquer ce code.
