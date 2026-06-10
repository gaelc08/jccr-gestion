# Procédure de Restauration - Plateforme Judo Club de Cattenom-Rodemack

## Vue d'ensemble

Cette procédure décrit les étapes pour restaurer l'ensemble de la plateforme en cas d'incident majeur (panne serveur, corruption de données, migration).

**Services critiques :**
- Keycloak (SSO / authentification) - `auth.judo-cattenom.fr`
- PostgreSQL (base de données Keycloak)
- Nextcloud (stockage documents) - `nextcloud.judo-cattenom.fr`
- Caddy (reverse proxy HTTPS)
- App Judo - `gestion.judo-cattenom.fr`

---

## 1. Pré-requis

- Accès SSH au serveur VPS (Ubuntu 24.04, Podman)
- Accès au NAS Synology (backups via rsync/SSH port 22222)
- Credentials administrateur dans `/home/hermes/.hermes/.env`
- Documentation réseau : IP `87.106.240.214`, Tailscale pour NAS

---

## 2. Restauration de Keycloak

### 2.1 Arrêter les services

```bash
cd /opt/keycloak
sudo podman-compose down
```

### 2.2 Restaurer PostgreSQL (base Keycloak)

```bash
# Identifier le dernier backup
BACKUP_FILE=$(ls -t /backups/postgres_keycloak_*.sql.gz 2>/dev/null | head -1)

if [ -n "$BACKUP_FILE" ]; then
    # Remonter les containers
    sudo podman-compose up -d postgres
    sleep 5
    
    # Restaurer la base
    zcat "$BACKUP_FILE" | sudo podman exec -i keycloak_postgres_1 psql -U keycloak -d keycloak
    
    echo "Base Keycloak restaurée depuis $BACKUP_FILE"
else
    echo "Aucun backup trouvé dans /backups/"
fi
```

### 2.3 Restaurer la configuration Keycloak

```bash
# Restaurer les thèmes personnalisés
tar -xzf /backups/nextcloud/keycloak_themes.tar.gz -C /opt/keycloak/themes/ 2>/dev/null

# Restaurer la configuration
tar -xzf /backups/nextcloud/keycloak_conf.tar.gz -C /opt/keycloak/ 2>/dev/null
```

### 2.4 Redémarrer et vérifier

```bash
sudo podman-compose up -d keycloak
sleep 10

# Vérifier les logs
sudo podman-compose logs --tail=50 keycloak

# Tester l'accès
curl -k https://auth.judo-cattenom.fr/realms/jccattenom/.well-known/openid-configuration
```

---

## 3. Restauration des utilisateurs

Si la base de données Keycloak est corrompue mais que les exports sont disponibles :

```bash
# Importer les coachs depuis backup
python3 /tmp/import_coaches.py \
  --input /backups/nextcloud/users_export.json

# Recréer l'admin manuellement via interface Keycloak
# admin@judo-cattenom.fr / mot de passe dans vault
```

---

## 4. Restauration de Nextcloud

### 4.1 Restaurer les données

```bash
cd /opt/nextcloud
sudo podman-compose down

# Restaurer les fichiers (depuis NAS si besoin)
rsync -avz --delete nas:/backups/nextcloud/data/ /var/lib/nextcloud/data/

# Restaurer la base MariaDB
BACKUP_DB=$(ls -t /backups/postgres_nextcloud_*.sql.gz 2>/dev/null | head -1)
sudo podman-compose up -d mariadb
sleep 5

zcat "$BACKUP_DB" | sudo podman exec -i nextcloud_mariadb_1 mysql -u nextcloud -p nextcloud

# Corriger les permissions
sudo chown -R www-data:www-data /var/lib/nextcloud/data
```

### 4.2 Réparer Nextcloud

```bash
sudo podman-compose up -d nextcloud
sleep 10

sudo podman exec -u www-data nextcloud_nextcloud_1 php occ maintenance:mode --on
sudo podman exec -u www-data nextcloud_nextcloud_1 php occ maintenance:repair
sudo podman exec -u www-data nextcloud_nextcloud_1 php occ files:scan --all
sudo podman exec -u www-data nextcloud_nextcloud_1 php occ maintenance:mode --off
```

---

## 5. Restauration de Caddy (Reverse Proxy)

```bash
# Restaurer la configuration
cp /backups/nextcloud/Caddyfile /etc/caddy/Caddyfile

# Redémarrer Caddy
sudo systemctl restart caddy

# Vérifier les certificats SSL
sudo caddy list-modules --config /etc/caddy/Caddyfile
```

---

## 6. Vérifications post-restauration

### 6.1 Tests fonctionnels

```bash
# Keycloak
curl -s https://auth.judo-cattenom.fr/realms/master/.well-known/openid-configuration | jq .issuer

# Nextcloud
curl -sI https://nextcloud.judo-cattenom.fr/status.php | head -5

# App Judo
curl -sI https://gestion.judo-cattenom.fr | head -5
```

### 6.2 Tests d'intégration

- [ ] Connexion admin Keycloak : https://auth.judo-cattenom.fr/admin
- [ ] Email de réinitialisation reçu par un utilisateur test
- [ ] Nextcloud accessible : https://nextcloud.judo-cattenom.fr
- [ ] Login SSO via App Judo (test@judo-cattenom.fr)
- [ ] Envoi d'email de reset fonctionne

### 6.3 Vérification des logs

```bash
# Keycloak
sudo podman-compose -f /opt/keycloak/docker-compose.yml logs --tail=20 keycloak

# PostgreSQL
sudo podman-compose -f /opt/keycloak/docker-compose.yml logs --tail=20 postgres

# Nextcloud
sudo podman-compose -f /opt/nextcloud/docker-compose.yml logs --tail=20

# Caddy
sudo journalctl -u caddy --since "1 hour ago" --no-pager | tail -20
```

---

## 7. Contacts d'urgence

| Rôle | Nom | Contact |
|------|-----|---------|
| Administrateur système | Gael Cantarero | gael.cantarero@gmail.com |
| Hébergeur VPS | Ionos | Support web |
| NAS Synology | Administration | Via Tailscale 100.88.229.47:22222 |

---

## 8. Fréquence des backups

| Service | Fréquence | Rétention | Emplacement |
|---------|-----------|-----------|-------------|
| PostgreSQL Keycloak | Quotidien 2h00 | 30 jours | NAS Synology |
| PostgreSQL Nextcloud | Quotidien 2h15 | 30 jours | NAS Synology |
| Nextcloud data | Quotidien 3h00 | 14 jours | NAS Synology |
| Thèmes Keycloak | À chaque modification | Indéfini | Git + NAS |

---

**Dernière mise à jour :** 10 juin 2026
