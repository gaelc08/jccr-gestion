# Extension Chrome — Saisie FFJDA

Extension Chrome (Manifest V3) pour préremplir automatiquement le formulaire de prise de licence sur [moncompte.ffjudo.com](https://moncompte.ffjudo.com) à partir des données adhérents du club.

## Fonctionnement

1. Importer les données adhérents (JSON ou CSV HelloAsso)
2. Ouvrir la page de saisie de licence sur moncompte.ffjudo.com
3. Cliquer sur l'icône de l'extension
4. Sélectionner l'adhérent à saisir
5. Cliquer sur **Préremplir le formulaire FFJDA**
6. Vérifier les champs et soumettre manuellement

## Structure

```
extension/
├── manifest.json          # Config MV3
├── popup/
│   ├── popup.html         # Interface utilisateur
│   ├── popup.css          # Styles
│   └── popup.js           # Logique popup
├── content/
│   └── content.js         # Injection dans la page FFJDA
├── background/
│   └── background.js      # Service worker
├── utils/
│   └── import.js          # Parseur CSV HelloAsso / JSON
└── icons/                 # Icônes à ajouter (16, 48, 128px)
```

## Installation (mode développeur)

1. Ouvrir Chrome → `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `extension/`

## ⚠️ Points à valider

- **Sélecteurs CSS** : les sélecteurs dans `content/content.js` (section `FIELD_MAP`) doivent être affinés une fois la page FFJDA inspectée avec les DevTools. Le DOM exact de `moncompte.ffjudo.com` doit être analysé pour identifier les vrais `name` / `id` des champs.
- **Format HelloAsso CSV** : les noms de colonnes dans `utils/import.js` doivent correspondre à l'export réel HelloAsso du club.
- **Icônes** : ajouter des icônes PNG dans `icons/` (16×16, 48×48, 128×128).

## 🔍 Reconnaissance du portail FFJDA (juin 2026)

- **Backend** : CodeIgniter 4 hébergé sur `api.ffjudo.com` (développé par Koredge)
- **API publique** : ❌ **Aucune API REST publique** — tous les endpoints testés (`/api`, `/swagger`, `/api-docs`, `/developer`) retournent 404
- **Portail `moncompte.ffjudo.com`** : formulaires HTML/POST classiques, pas d'API JSON identifiable
- **Debugbar CI4** : actif en production (CodeIgniter Debug Toolbar + Kint) — fuit des infos serveur mais pas d'aide pour une intégration API
- **Conclusion** : l'extension Chrome avec scraping DOM reste la **seule approche viable** pour préremplir les licences FFJDA

## Prochaines étapes

- [ ] Inspecter le DOM de la page FFJDA et corriger les sélecteurs
- [ ] Ajouter une page d'import CSV/JSON dans la popup
- [ ] Gérer le statut « licence saisie » en retour dans l'app club
