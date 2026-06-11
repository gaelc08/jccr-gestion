# Extension Chrome — Saisie FFJDA v1.1.0

Extension Chrome (Manifest V3) pour préremplir automatiquement le formulaire de prise de licence sur [moncompte.ffjudo.com](https://moncompte.ffjudo.com) à partir des données adhérents du club.

## Fonctionnalités (v1.1.0)

✅ **Sync automatique HelloAsso** : récupère les adhérents en temps réel via l'API  
✅ **Badge saisie** : marque visuellement les licences déjà traitées (`is_saisi=true`)  
✅ **Import en ligne** : plus besoin d'export XLSX manuel — chargement direct depuis HelloAsso  
✅ **Marquage auto** : après chaque licence validée sur FFJDA, marque automatiquement l'adhérent comme saisi via l'API  
✅ **Page Paramètres** : configure ton token HelloAsso en 1 clic  
✅ **Queue batch** : traite plusieurs adhérents d'affilée (nouvelles licences + renouvellements)  

## Installation (mode développeur)

1. Cloner ce repo :
   ```bash
   git clone https://github.com/gaelc08/jccattenom-app.git
   cd jccattenom-app/extension
   ```

2. Ouvrir Chrome → `chrome://extensions`

3. Activer le **Mode développeur** (toggle en haut à droite)

4. Cliquer **Charger l'extension non empaquetée**

5. Sélectionner le dossier `extension/`

6. Configurer le token HelloAsso :
   - Ouvrir la popup de l'extension
   - Cliquer sur ⚙️ (Paramètres)
   - Coller ton token HelloAsso

## Utilisation

### Import adhérents HelloAsso

**Option A : Import en ligne (recommandé)**
1. Cliquer sur l'icône de l'extension
2. Cliquer sur **Importer** (en haut à droite)
3. Sélectionner le club (Judo / Iaïdo)
4. Cliquer sur **🔄 Charger depuis HelloAsso**
5. La liste se recharge automatiquement

**Option B : Import XLSX manuel** (pour debug / offline)
1. Exporter les adhérents depuis HelloAsso en XLSX
2. Cliquer sur **Importer** dans la popup
3. Glisser-déposer le fichier XLSX dans la zone prévue
4. Cliquer sur **Importer dans la file d'attente**

### Saisie licence FFJDA

1. Ouvrir [moncompte.ffjudo.com](https://moncompte.ffjudo.com)
2. Aller dans la page de saisie de licence
3. Cliquer sur l'icône de l'extension
4. Sélectionner un adhérent dans la liste (badge ✅ si déjà saisi)
5. Cliquer sur **Préremplir le formulaire**
6. L'extension remplit automatiquement les champs et valide chaque étape
7. **Marquage auto** : après soumission réussie, l'adhérent est marqué `is_saisi=true` via l'API

### Queue batch (plusieurs adhérents)

1. Sélectionner plusieurs adhérents (cases à cocher)
2. Cliquer sur **Saisir en batch** ou **Renouveler en batch**
3. L'extension parcourt tous les adhérents d'affilée
4. À chaque licence validée, le badge ✅ apparaît et `mark-saisie` est appelé automatiquement

## Structure

```
extension/
├── manifest.json          # Config MV3 (permissions, host_permissions)
├── lib/
│   └── api.js             # Client API HelloAsso (sync, adherents, mark-saisie)
├── popup/
│   ├── popup.html         # Interface principale (liste adhérents, actions)
│   ├── popup.css          # Styles (badge saisie, boutons, queue progress)
│   ├── popup.js           # Logique popup (sync auto, sélection, queue)
│   ├── import.html        # Page d'import (XLSX + API en ligne)
│   ├── import.js          # Parseur SheetJS + client API HelloAsso
│   └── import.css         # Styles page import
├── settings/
│   ├── settings.html      # Page configuration (token HelloAsso, stats)
│   ├── settings.js        # Sauvegarde token + trigger sync manuel
│   └── settings.css       # Styles page settings
├── background/
│   └── background.js      # Service worker : saisie FFJDA + mark-saisie auto
├── userscripts/
│   └── cea-autofill.user.js  # UserScript pour CEA (non intégré à l'extension)
└── icons/                 # Icônes extension (à générer)
```

## API HelloAsso

L'extension communique avec [`sync.judo-cattenom.fr`](https://sync.judo-cattenom.fr) via les endpoints suivants :

- `GET /adherents` : liste tous les adhérents synchronisés
- `POST /sync` : déclenche une synchronisation avec HelloAsso
- `GET /stats` : récupère les stats de la dernière sync
- `POST /mark-saisie` : marque un `order_id` comme licence saisie dans FFJDA

Le token est stocké dans `chrome.storage.sync` (partage cross-devices si connecté au compte Google).

## 🔍 Reconnaissance du portail FFJDA (juin 2026)

- **Backend** : CodeIgniter 4 hébergé sur `api.ffjudo.com` (développé par Koredge)
- **API publique** : ❌ **Aucune API REST publique** — tous les endpoints testés retournent 404
- **Portail `moncompte.ffjudo.com`** : formulaires HTML/POST classiques, pas d'API JSON identifiable
- **Debugbar CI4** : actif en production (fuit des infos serveur mais pas d'aide pour intégration)
- **Conclusion** : l'extension Chrome avec scraping DOM reste la **seule approche viable** pour préremplir les licences FFJDA

## Changelog

### v1.1.0 (juin 2026)
- ✨ Sync automatique HelloAsso via API (`JccApi.getAdherents()`)
- ✨ Badge saisie visuel (`is_saisi=true` détecté automatiquement)
- ✨ Marquage automatique après chaque licence FFJDA validée
- ✨ Import en ligne HelloAsso (sans XLSX manuel)
- ✨ Page Paramètres pour configurer le token API
- ✨ Client API partagé (`lib/api.js`)
- 🐛 Correction queue renouvellement (navigation step detection)

### v1.0.0 (mai 2026)
- Première version : préremplissage manuel XLSX → JSON → clipboard

## Support

Pour remonter un bug ou demander une feature : ouvrir une issue sur [GitHub](https://github.com/gaelc08/jccattenom-app/issues).

---

**Développé par** : Gaël Cantarero pour le Judo Club Cattenom
