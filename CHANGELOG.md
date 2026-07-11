# jccr-gestion — Changelog

## v1.0.0 (2026-07-08)
Première version paramétrée. Auto-détection test/prod.

### Changements
- **env.js** : ajout `isTestHost`, `kcUrl`, `kcRealm`, `kcClient`, `siteUrl`
- **auth-listeners.js** : importe la config KC depuis `env.js` au lieu de valeurs codées en dur
- **Supabase test** : auto-détection vers le proxy self-hosté `test.judo-cattenom.fr/supabase/`
- **VERSION + CHANGELOG** ajoutés

### Avant
URLs prod (`auth.judo-cattenom.fr`) codées en dur dans 3 endroits de auth-listeners.js.

### Après
Le même code fonctionne en test et prod.
Détection automatique via le hostname dans env.js.
