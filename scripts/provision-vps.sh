#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Dropships — één-server productie-VPS provisioning (Ubuntu 24.04, Hetzner)
# ═══════════════════════════════════════════════════════════════════════════
# Idempotent: veilig meerdere keren te draaien. Draai als root (of via sudo) op
# de VERSE VPS. Zet vooraf je publieke SSH-key al klaar zodat key-only login niet
# je eigen toegang blokkeert.
#
#   scp scripts/provision-vps.sh root@<VPS_IP>:/root/
#   ssh root@<VPS_IP> 'DOMAIN=jouwdomein.nl bash /root/provision-vps.sh'
#
# Wat dit doet: basis-hardening (ssh key-only, ufw 22/80/443, auto-updates),
# installeert Node/PM2/nginx/git, maakt de app-user + één-server nginx include-
# model, en zet een smalle sudoers-regel voor `systemctl reload nginx`.
# Daarna volgen de handmatige stappen (repo .env, Cloudflare named tunnel,
# GitHub runner) die credentials vereisen — zie de ECHO's aan het eind.
set -euo pipefail

APP_USER="${APP_USER:-dropships}"
APP_HOME="/opt/dropships"
APP_DIR="$APP_HOME/app"
REPO="${REPO:-https://github.com/Dylan0165/Dropships.git}"
DOMAIN="${DOMAIN:-jouwdomein.nl}"
NODE_MAJOR="${NODE_MAJOR:-22}"

echo "═══ 1/8  Systeem bijwerken + automatische security-updates ═══"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y
apt-get install -y unattended-upgrades ufw curl git nginx
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now unattended-upgrades || true

echo "═══ 2/8  SSH hardening: key-only login ═══"
# Alleen doen als er al een authorized_key bestaat (anders sluit je jezelf buiten)
if [ -s /root/.ssh/authorized_keys ] || [ -s "/home/$APP_USER/.ssh/authorized_keys" ]; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
  systemctl reload ssh || systemctl reload sshd || true
  echo "  wachtwoord-login uitgeschakeld"
else
  echo "  ⚠ geen authorized_keys gevonden — wachtwoord-login NIET uitgezet (zou je buitensluiten). Zet eerst je key en draai opnieuw."
fi

echo "═══ 3/8  Firewall (ufw): alleen 22/80/443 ═══"
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable
ufw status verbose

echo "═══ 4/8  Node.js ${NODE_MAJOR} + PM2 ═══"
if ! command -v node >/dev/null || [ "$(node -v | grep -oE '[0-9]+' | head -1)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm install -g pm2
node -v && pm2 -v

echo "═══ 5/8  App-user + repo ═══"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -d "$APP_HOME" -s /bin/bash "$APP_USER"
mkdir -p "$APP_HOME"; chown -R "$APP_USER:$APP_USER" "$APP_HOME"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone "$REPO" "$APP_DIR"
else
  echo "  repo bestaat al"
fi

echo "═══ 6/8  Één-server nginx model (app-owned include-dir) ═══"
# Stores-root + include-dir zijn eigendom van de app-user → deploy schrijft
# releases en vhost-conf ZONDER sudo. Alleen de reload heeft sudo nodig.
mkdir -p /var/www/stores /etc/nginx/dropships.d
chown -R "$APP_USER:$APP_USER" /var/www/stores /etc/nginx/dropships.d
# nginx.conf de include laten doen (idempotent)
if ! grep -q 'dropships.d' /etc/nginx/nginx.conf; then
  sed -i '/http {/a\    include /etc/nginx/dropships.d/*.conf;' /etc/nginx/nginx.conf
fi
# Hoofd-vhosts: tool-dashboard (api.DOMAIN → :3001) — stores komen als losse
# *.conf in dropships.d bij elke deploy.
cat > /etc/nginx/sites-available/dropships-api <<NGINX
server {
  listen 80;
  server_name api.${DOMAIN};
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/dropships-api /etc/nginx/sites-enabled/dropships-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "═══ 7/8  Smalle sudoers-regel voor nginx reload (geen volledige sudo) ═══"
cat > /etc/sudoers.d/dropships-nginx <<SUDO
${APP_USER} ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
SUDO
chmod 440 /etc/sudoers.d/dropships-nginx
visudo -c

echo "═══ 8/8  Klaar met het geautomatiseerde deel ═══"
cat <<NEXT

── NOG HANDMATIG (vereist credentials) ─────────────────────────────────────
1. env (ÉÉN bron van waarheid — geen backup-bestand):
     sudo -u ${APP_USER} cp ${APP_DIR}/.env.example ${APP_DIR}/UIcontrol/.env
     sudo -u ${APP_USER} nano ${APP_DIR}/UIcontrol/.env
     # vul in: CJ_* (sandbox), MOLLIE_API_KEY (test_...), DEEPSEEK_API_KEY,
     #         DEPLOY_MODE=local, STORE_BASE_DOMAIN=${DOMAIN}, PUBLIC_BASE_URL=https://api.${DOMAIN}

2. Eerste build + PM2-start:
     cd ${APP_DIR}/UIcontrol && sudo -u ${APP_USER} npm ci && sudo -u ${APP_USER} npm run build
     sudo -u ${APP_USER} pm2 start npm --name uicontrol -- run server
     sudo -u ${APP_USER} pm2 start npm --name store-platform -- run store-platform
     sudo -u ${APP_USER} pm2 save
     sudo env PATH=\$PATH pm2 startup systemd -u ${APP_USER} --hp ${APP_HOME}   # → processen overleven reboot

3. Cloudflare named tunnel + wildcard DNS:  zie scripts/cloudflared-named-tunnel.md

4. GitHub Actions self-hosted runner (label 'dropships-vps'):
     # Repo → Settings → Actions → Runners → New self-hosted runner (Linux x64)
     # draai de getoonde ./config.sh met:  --labels dropships-vps
     # daarna:  sudo ./svc.sh install ${APP_USER} && sudo ./svc.sh start
────────────────────────────────────────────────────────────────────────────
NEXT
echo "Provisioning basis voltooid ✓"
