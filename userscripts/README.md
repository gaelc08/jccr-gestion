# UserScripts

Scripts navigateur (Tampermonkey / Violentmonkey) pour pré-remplir des formulaires externes à partir des données de l'app JC Cattenom.

## Scripts disponibles

| Script | Cible | Usage |
|--------|-------|-------|
| `cea-autofill.user.js` | [cea.urssaf.fr](https://www.cea.urssaf.fr) | Pré-remplit la déclaration de prestations sociales (salaire, heures, période) depuis la synthèse mensuelle de l'app |

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) ou [Violentmonkey](https://violentmonkey.github.io/) dans Chrome/Firefox
2. Cliquer sur le lien `@downloadURL` du script (GitHub raw) — le gestionnaire de scripts proposera l'installation
3. Les mises à jour sont automatiques via `@updateURL`

## Workflow CEA URSSAF

1. Dans l'app gestion → onglet **Salaire** → cliquer **"Copier pour CEA"** sur le mois voulu
2. Ouvrir `cea.urssaf.fr` → **Créer une prestation**
3. Le panneau flottant **🥋 JC Cattenom → CEA** apparaît automatiquement
4. Coller les données (Ctrl+V ou bouton "Coller")
5. Remplir chaque étape une par une avec les boutons dédiés
