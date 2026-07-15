# Development Workflow

## Branches & Environments

- **`main`** → Production (Supabase prod: `ajbpzueanpeukozjhkiv`)
- **`dev`** → 🧪 Test NAS (Supabase container: `test.judo-cattenom.fr/supabase`)

> ⚠ Ancien projet dev cloud (`nkzsjyzhpvivfgslzltn`) mis en pause — voir `docs/legacy-dev-supabase.md`

## URLs

- **Production**: https://gestion.judo-cattenom.fr/
- **Test**: https://test.judo-cattenom.fr/ (Supabase container NAS + Keycloak)

## Workflow

### 1. Feature Development

```bash
# Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# Make changes, commit, push
git push origin feature/my-feature

# → Test on test.judo-cattenom.fr
```

### 2. Testing on Test env

- Push to `dev` branch → deploys to test environment (NAS container)
- Test at: https://test.judo-cattenom.fr/
- Database changes are isolated to the test Supabase container

### 3. Merge to Production

```bash
# After testing on test env, merge to main
git checkout main
git pull origin main
git merge dev
git push origin main

# → Deploys to prod Supabase
# → Migrations run on prod project
```

## Database Migrations

### Creating a Migration

```bash
# Create new migration file
supabase migration new my_migration_name

# Edit the SQL file in supabase/migrations/
# Push to test environment first
git checkout dev
git add supabase/migrations/
git commit -m "feat: add my_migration_name"
git push origin dev

# Test on test.judo-cattenom.fr
# Once verified, merge to main
```

## Best Practices

✅ **DO:**
- Test migrations on test env first
- Use descriptive commit messages
- Keep dev and main in sync
- Review changes before merging to main

❌ **DON'T:**
- Push directly to main (use PR)
- Modify prod data without backup
- Skip testing on test env
- Commit secrets or credentials
