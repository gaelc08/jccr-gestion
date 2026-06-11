# FFJDA Recon Script

Script de reconnaissance pour capturer la structure du portail `moncompte.ffjudo.com` et exploiter la debugbar CI4.

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) ou [Violentmonkey](https://violentmonkey.github.io/)
2. Ouvrir `ffjda-recon.user.js` dans le gestionnaire de scripts
3. Enregistrer

## Utilisation

1. **Se connecter** sur [moncompte.ffjudo.com](https://moncompte.ffjudo.com)
2. Le panneau **🔍 FFJDA Recon** apparaît en haut à droite
3. **Naviguer** dans le portail :
   - Page de connexion → capture les routes d'authentification
   - Menu principal → capture les routes de navigation
   - **Page de saisie de licence** → capture les champs du formulaire ⭐
   - Liste des adhérents → capture les structures de données
4. Le panneau affiche en temps réel :
   - 📡 Routes API interceptées
   - 🛤 Routes debugbar CI4
   - 🗃 Requêtes SQL (noms de tables/colonnes)
   - 📝 Champs de formulaire (name, id, type)
   - 🌐 Variables JS globales
   - 🔑 Données sensibles exposées
5. **Exporter** :
   - **💾 Exporter JSON** → télécharge un fichier complet
   - **📋 Copier dans le clipboard** → colle le résultat

## Données capturées

Le JSON exporté contient :
- `routes` : tous les endpoints FFJDA identifiés
- `sqlQueries` : requêtes SQL → noms de tables et colonnes
- `formFields` : structure complète des formulaires par page
- `cookies` : cookies de session
- `localStorage` : clés du stockage local
- `pages` : réponses JSON capturées

## Après capture

Copier/extraire le JSON et le partager avec Hermes pour :
1. Construire la `FIELD_MAP` de l'extension Chrome
2. Identifier les sélecteurs CSS exacts des champs
3. Comprendre le flux de saisie de licence
