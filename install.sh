#!/bin/bash
#===========================================
# NET2APP Hub - Complete SMS Platform
# One-Command Installer
#===========================================
# Usage: bash <(curl -s https://raw.githubusercontent.com/eliasewu/net2app-hub-V2/main/install.sh)
# OR:    git clone https://github.com/eliasewu/net2app-hub-V2.git && cd net2app-hub-V2 && sudo bash install.sh
#===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     NET2APP Hub - SMS Platform Installer     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root: sudo bash install.sh${NC}"
    exit 1
fi

APP_DIR="/opt/net2app-hub"
DB_NAME="sms_platform"
DB_USER="sms_user"
DB_PASS="SmsPlatform2024Secure"

#===========================================
# 1. SYSTEM UPDATE
#===========================================
echo -e "${YELLOW}[1/10] Updating system...${NC}"
apt update -qq && apt upgrade -y -qq

#===========================================
# 2. NODE.JS 20
#===========================================
echo -e "${YELLOW}[2/10] Installing Node.js 20...${NC}"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
fi
echo -e "${GREEN}Node.js: $(node --version)${NC}"

#===========================================
# 3. POSTGRESQL
#===========================================
echo -e "${YELLOW}[3/10] Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib > /dev/null 2>&1
systemctl start postgresql
systemctl enable postgresql

#===========================================
# 4. DATABASE SETUP
#===========================================
echo -e "${YELLOW}[4/10] Creating database...${NC}"
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME;\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';\"" 2>/dev/null || true
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;\""
su - postgres -c "psql -d $DB_NAME -c \"GRANT ALL ON SCHEMA public TO $DB_USER;\""

# Fix auth to md5
PG_HBA=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
if [ -f "$PG_HBA" ]; then
    sed -i 's/scram-sha-256/md5/g' "$PG_HBA"
    systemctl restart postgresql
fi

#===========================================
# 5. IMPORT SCHEMA
#===========================================
echo -e "${YELLOW}[5/10] Importing database schema...${NC}"
PGPASSWORD=$DB_PASS psql -h localhost -U $DB_USER -d $DB_NAME -f database_full.sql > /dev/null 2>&1
echo -e "${GREEN}Database: 27 tables created${NC}"

#===========================================
# 6. INSTALL DEPENDENCIES
#===========================================
echo -e "${YELLOW}[6/10] Installing npm packages...${NC}"
npm install --silent

#===========================================
# 7. ENVIRONMENT CONFIG
#===========================================
echo -e "${YELLOW}[7/10] Configuring environment...${NC}"
cat > .env << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
SMPP_PORT=2775
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
JWT_SECRET=$(openssl rand -base64 32)
API_KEY=$(openssl rand -hex 32)
EOF

#===========================================
# 8. BUILD FRONTEND
#===========================================
echo -e "${YELLOW}[8/10] Building frontend...${NC}"
npm run build --silent

#===========================================
# 9. NGINX SETUP
#===========================================
echo -e "${YELLOW}[9/10] Setting up Nginx...${NC}"
apt install -y nginx > /dev/null 2>&1

# Stop any service on port 80
fuser -k 80/tcp 2>/dev/null || true

cat > /etc/nginx/sites-available/sms-platform << NGINX
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location / {
        root $APP_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/sms-platform /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx

#===========================================
# 10. START SERVICES
#===========================================
echo -e "${YELLOW}[10/10] Starting services...${NC}"
npm install -g pm2 --silent 2>/dev/null || true
pm2 delete sms-platform 2>/dev/null || true
pm2 start server.cjs --name sms-platform
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

sleep 3

#===========================================
# DONE
#===========================================
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✅ INSTALLATION COMPLETE!                ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  🌐 Frontend:  http://$IP          ║${NC}"
echo -e "${GREEN}║  📡 SMPP:      $IP:2775              ║${NC}"
echo -e "${GREEN}║  🔑 Login:     admin / admin123              ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Services:                                   ║${NC}"
echo -e "${GREEN}║  - PostgreSQL: 27 tables                     ║${NC}"
echo -e "${GREEN}║  - Node.js API: port 3000                    ║${NC}"
echo -e "${GREEN}║  - SMPP Server: port 2775 (TRX)              ║${NC}"
echo -e "${GREEN}║  - Nginx: port 80                            ║${NC}"
echo -e "${GREEN}║  - PM2: auto-restart enabled                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  To restart: ${YELLOW}pm2 restart sms-platform${NC}"
echo -e "  To view logs: ${YELLOW}pm2 logs sms-platform${NC}"
echo ""
