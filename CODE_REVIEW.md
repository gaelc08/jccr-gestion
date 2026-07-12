# Revue de code — JCC Gestion (Judo Club Cattenom)

**Date :** 2026-07-12
**Périmètre :** `public/modules/*.js` (artefacts bundlés par Vite), `public/app-modular.ts`, `public/modules/env.js`, config Vite, migrations Supabase (RLS).
**Méthode :** greps ciblés (XSS / tokens / fetch / JSON.parse / listeners), comparaison des paires `.js`/`.ts`, lecture des chemins critiques (auth, rôle, rest-gateway, SSO), 3 audits parallèles (XSS, divergence, bugs) + vérification manuelle des points à fort impact. **Lecture seule — aucun fichier source modifié.**

---

## Synthèse exécutive

Le code est globalement sain et défensif. Points vérifiés et **jugés corrects** (pas de faille) :

- **Dérive `.js`/`.ts` : AUCUNE.** Les 12 paires clés (members-section, auth-listeners, event-listeners, calendar-ui, competitions-ui, export-ui, data-loader, admin-service, auth-admin, summary-ui, rest-gateway, mileage-service) ont été validées en **retranspilant chaque `.ts` avec l'esbuild du projet et en diffant l'octet-à-octet contre le `.js` livré** : identiques (aux seuls retours à la ligne près sur members-section). Le risque « logique divergente » du contexte critique **ne se matérialise pas**.
- **Échappement XSS : présent et cohérent.** `__escapeHtml` (`shared-utils.js:74`) échappe `& < > " '`. `members-section.js` (48 KB, ~17 sites `innerHTML`) échappe **tous** les champs membres (noms, emails, DOB, licences, réconciliation HA/FFJDA). `export-ui.js` (srcdoc) et `audit-ui.js` idem, avec `sanitizeUrl` pour les URLs.
- **Rôles : RLS serveur présente.** Fonction `is_admin` + policies (`supabase/migrations/*`). Le contrôle admin côté client (`auth-admin.js`) n'est qu'un *gating UI*, adossé à la RLS/RPC serveur — modèle correct.
- **Console en prod : supprimée.** `vite.config.ts` → `esbuild.drop: ['console']`; `dist/index.html` ne charge que `assets/index-*.js` (0 `console`). Les logs `DEBUG` résiduels dans `public/modules/*.js` ne s'exécutent **pas** en prod bundlée.
- **JWT/tokens : pas de secret en dur.** Les clés dans `env.js` sont des clés **anon** (rôle `anon`, publiques par design + RLS). SSO Keycloak = client public PKCE, **sans** client-secret dans le navigateur. Aucun `JSON.parse` non gardé.

Les points ci-dessous sont classés par gravité décroissante.

---

## 🔴 Critique

### C1 — `env.js:44-45` : `localStorage.getItem` non gardé au chargement du module → écran blanc pour toute l'app
```js
const localDevUrlOverride = window.localStorage.getItem('jct.dev.supabase.url');
const localDevKeyOverride = window.localStorage.getItem('jct.dev.supabase.key');
```
Exécuté au *module-evaluation time*, **hors try/catch** (contrairement aux lignes 22-34 qui, elles, sont protégées). En contexte de stockage restreint (Safari navigation privée, cookies/site-data bloqués), l'accès à `localStorage` lève `SecurityError`. `env.js` étant importé transitivement par presque tous les modules, cette exception **avorte le démarrage → page blanche**, dans **tous** les environnements (pas seulement dev).
**Reco :** envelopper dans `try/catch` (modèle correct : `auth-runtime.js:6-9`).

### C2 — `competitions-ui.js:81` : XSS stocké via attribut `value` non échappé
```js
categoryOptions = categories.map((c) => `<option value="${c}"${_filteredCategory === c ? " selected" : ""}>${escapeHtml(c)}</option>`)
```
Le *texte* de l'option est échappé mais **pas** l'attribut `value="${c}"`. `c` provient de `comp.categories` — données Supabase **persistées** alimentées par le scraping de `judo-moselle.fr` (`triggerSync`). Une catégorie contenant `"><...>` sort de l'attribut ; en mode d'insertion HTML « in select », `</select>` + markup permet l'exécution (`<img src=x onerror=...>`). **Impact aggravé :** le `jcc_api_token` (bearer vers `sync.judo-cattenom.fr`, qui expose les PII adhérents : emails, DOB) est en `localStorage` → un XSS l'exfiltre. Contrôlabilité modérée (source fédérale externe / écriture DB), d'où « stocké » plutôt qu'« injecté par un utilisateur normal », mais c'est **la seule exécution de code du front**.
**Reco :** `value="${escapeHtml(c)}"` (idéalement construire l'option via `createElement`/`textContent`/`value` comme members-section:127-132).

### C3 — `export-ui.js:467-473` : import ignore le statut HTTP et annonce « succès » → perte de données silencieuse
`importCoachData` POST chaque coach/ligne sans jamais vérifier `res.ok`, puis termine toujours par `alert("Import terminé avec succès.")`. Tout insert rejeté (401/403 RLS, contrainte, payload invalide) est **avalé** ; une restauration totalement échouée est rapportée comme réussie. Sur une opérasion de *restore*, c'est une corruption/perte de données silencieuse.
**Reco :** vérifier `res.ok` par requête, collecter les échecs, les afficher. (Même bug dans le mort `export-data.js:56-71`.)

---

## 🟠 Important

### I1 — `export-ui.js:446-451` : sauvegarde `.json()` sans contrôle `res.ok` → backup corrompu
`exportBackupJSON` fait `await coachesRes.json()` / `timeDataRes.json()` sans `res.ok`. Si le token est expiré / RLS refuse, Supabase renvoie un **objet JSON d'erreur** `{message,code,...}` en 401/403 : `.json()` réussit et cet objet est écrit dans le fichier de sauvegarde comme `coaches`/`time_data`. L'utilisateur croit avoir un backup valide.
**Reco :** `if (!coachesRes.ok || !timeDataRes.ok) throw ...` avant `.json()`.

### I2 — `summary-ui.js:63` et `:81` : fetch gel/dégel sans try/catch → rejet non géré, no-op silencieux
`toggleFreezeMonth` `await`e deux `fetch` (DELETE/POST `frozen_timesheets`) avec gestion de `!res.ok` mais **sans try/catch autour du fetch**. Invoquée fire-and-forget via `event-listeners.js:153` (`bindClick("freezeBtn", () => toggleFreezeMonth?.())`), sans `await` ni `.catch`. Sur erreur réseau → *unhandled rejection*, aucun retour utilisateur, le gel/dégel échoue en silence.
**Reco :** entourer d'un `try/catch` avec `alert`, comme les branches `!res.ok` existantes.

### I3 — `members-section.js:291` : listener `document` « click » ré-attaché à chaque rendu → fuite de listeners
Dans `renderListTab`, un `document.addEventListener("click", …)` (fermeture du dropdown colonnes) est ajouté à **chaque** rendu : à chaque changement d'onglet (`switchTab`→`renderActiveTab`), sur `membersUnsaisieOnly` (`:761`), sur chaque `loadAndRenderAll` (sync/import/campagne). Jamais retiré ; chaque closure capture un `colsDropdown` désormais détaché. Accumulation illimitée sur une session → fuite mémoire + handlers morts sur tout clic document.
**Reco :** attacher une seule fois (flag de garde, ou dans `bootMembersSection`), ou `removeEventListener`. (`event-listeners.js:217` est correct car gardé par `__eventListenersSetup`.)

### I4 — `supabase-client.js:15,33` : la détection `.supabase.co` rate le self-hosté → timeout de sécurité inopérant
```js
const isSupabase = String(url).includes('.supabase.co');
```
Pour l'env **self-hosté** (`test.judo-cattenom.fr/supabase`, cf. `env.js:8`), `isSupabase` est `false` → le **timeout fetch (15s / 60s Edge)** — dont le but explicite est « so requests never hang forever » — **ne s'applique jamais**. Les requêtes peuvent pendre indéfiniment sur l'instance self-hostée, exactement le scénario que ce wrapper devait couvrir.
**Reco :** détecter par comparaison avec `supabaseUrl` importé de `env.js` (`url.startsWith(supabaseUrl)`) plutôt qu'un littéral `.supabase.co`.

### I5 — 23 modules `.js` sans jumeau `.ts` → jamais type-checkés
Le garde-fou « double fichier » ne couvre que 12 modules. Les modules substantiels **sans** source typée échappent au type-check : `coach-manager.js` (12 KB), `auth-state.js` (8 KB), `helloasso-service.js`, `auth-sso.js`, `supabase-client.js`, `env.js`, `export-expense/timesheet/declaration/data/helpers.js`, `app-context.js`, `audit-controller.js`, `audit-ui.js`, `competitions-service.js`, `holidays-service.js`, `auth-forms/runtime/admin-cache.js`…
**Reco :** ajouter un `.ts` (même minimal) pour au moins auth-*, supabase-client, env, helloasso-service, coach-manager, ou activer `checkJs` sur ces fichiers.

### I6 — `helloasso-service.js:49` : `r.json()` avant `r.ok` → erreur cryptique pour toutes les opés HelloAsso/FFJDA
`_apiCall` fait `const data = await r.json()` (l.49) **avant** de tester `r.ok` (l.50). Sur une page d'erreur non-JSON du VPS/nginx (502/504/HTML), `.json()` lève `SyntaxError: Unexpected token '<'` au lieu d'un message HTTP exploitable. Impacte sync, adhérents, réconciliation, import FFJDA, correction de nom.
**Reco :** `await r.text()`, tester `r.ok`, puis `JSON.parse` gardé.

---

## 🟡 Mineur

### M1 — `competitions-ui.js:69` : `href` non filtré par schéma
`<a href="${escapeHtml(comp.url_source)}">` : l'URL (donnée de sync externe) est HTML-échappée mais pas validée ; un `javascript:`/`data:` survivrait. Risque faible (`target="_blank"` bloque `javascript:` sur nav modernes) mais incohérent avec `sanitizeUrl` (`export-ui.js:307-316`).
**Reco :** réutiliser `sanitizeUrl` (whitelist `http:`/`https:`).

### M2 — `competitions-ui.js:14-16` : `escapeHtml` local plus faible que le partagé
N'échappe pas `'` (contrairement à `__escapeHtml`). Non exploitable ici (attributs en double-quote uniquement) mais fragile.
**Reco :** importer et utiliser `__escapeHtml` de `shared-utils.js`.

### M3 — `members-section.js` (renders réconciliation/liste) : race « last-response-wins »
`renderReconciliationTab`/`renderListContent` sont lancés en `void render…()` et via `setTimeout` debouncé (400ms, `:1027`). Deux rendus concurrents (recherches rapides) : une réponse lente antérieure peut écraser `panel.innerHTML` après une plus récente → données périmées affichées. Le debounce atténue sans supprimer.
**Reco :** id de requête monotone / `AbortController`, ignorer les réponses périmées.

### M4 — `export-data.js` : module entièrement mort (doublon de `export-ui.js`)
`createExportData` n'est jamais importé (`app-modular.ts` câble `createExportUI`). Le fichier duplique les bugs I1/C3.
**Reco :** supprimer le module.

### M5 — `event-listeners.js:253-260` : handler délégué sur `#calendarGrid` inexistant
`index.html` ne contient que `#calendar`. Code mort (n'ouvre pas de double modal — les clics passent par `calendar-ui.js:189`).
**Reco :** supprimer.

### M6 — `auth-sso.js:92-102` : fallback « sans PKCE »
Si `generateCodeChallenge` échoue (crypto.subtle indisponible → origine non sécurisée), l'auth est lancée **sans** `code_challenge`, tout en laissant un `pkce_verifier` périmé en `sessionStorage`. Flux code sans PKCE sur client public = affaibli ; l'échange ultérieur échouera de toute façon.
**Reco :** supprimer le fallback (fail-closed) ; la crypto est toujours dispo en HTTPS.

### M7 — Logs `DEBUG` verbeux dans les `.js` commités + `init` loggé
Non exécutés en prod (drop console + bundle propre), mais : (a) `supabase-client.js:18` loggue `init` (donc l'en-tête `Authorization: Bearer …`) → **token visible en console en DEV** ; (b) `publicDir` = racine fait que `dist/` embarque aussi les copies brutes `modules/*.js` (avec logs) et `app-modular.ts`, publiquement servies bien que non chargées.
**Reco :** ne pas logguer `init` ; ajouter `modules/**` et `*.ts` à l'exclusion de `publicDir` ou nettoyer `dist/`.

### M8 — `members-section.js` : fonctions de rendu très longues, fichier 48 KB
Plusieurs builders `panel.innerHTML = html` de 50-130 lignes (list/whatsapp/category/réconciliation). Maintenable mais dense.
**Reco :** extraire des helpers de rendu par onglet ; envisager un mini-template escapé.

### M9 — `helloasso-service.js:152-168` : `importHelloAssoCsvData` fait N `UPDATE` séquentiels
Un `await supabase.from(...).update()` par ligne CSV → lent sur gros fichiers, et chaque échec réseau interrompt la boucle sans reprise.
**Reco :** batcher (upsert) ou paralléliser avec limite de concurrence + collecte d'erreurs.

### M10 — Usage généralisé de `alert()` pour erreurs/succès (SSO, export, gel…)
Fonctionnel mais UX pauvre et bloquant.
**Reco :** centraliser un toast/notif non bloquant.

---

## Vérifications complémentaires (non-problèmes confirmés)

- `JSON.parse` : `auth-admin.js:45`, `rest-gateway.js:40/83`, `shared-utils.js:26` — tous gardés.
- `data-loader.js:55` (`claim_user_profile`) sans try local : conçu pour throw, tous les appelants catchent (`auth-listeners.js:399`, `event-listeners.js:206`).
- Concurrence admin (`auth-listeners.js:113-153`, `__adminInFlight`) et gardes `__uiInitializedForUser` / `__eventListenersSetup` : correctes, pas de race d'init.
- Clés `env.js` : clés **anon** publiques (RLS) — pas une fuite de secret. *(À confirmer : qu'aucune n'est une `service_role`.)*
</content>
</invoke>
