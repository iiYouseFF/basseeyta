# VPS Setup Guide — Basita Backend

Run once via SSH:

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt update
sudo apt install -y nodejs git nginx redis-server certbot python3-certbot-nginx

# Verify
node -v # 20.x
npm -v
redis-cli ping # PONG

# PM2
sudo npm install -g pm2
pm2 startup
# copy & run the command pm2 prints

# Create deploy dir
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone git@github.com:iiYouseFF/basseeyta.git basita-backend
cd basita-backend

# Env
cp .env.example .env
nano .env # fill secrets

# Install & build
npm ci
npm run build

# PM2 start
pm2 start ecosystem.config.js --env production
pm2 save

# Nginx
sudo cp nginx/basita.conf /etc/nginx/sites-available/basita
sudo ln -s /etc/nginx/sites-available/basita /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# HTTPS (optional – currently API is at http://basseeyta.duckdns.org/ )
# For TLS: sudo certbot --nginx -d basseeyta.duckdns.org

# Redis systemd
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify deploy
curl http://localhost:3000/health
curl http://basseeyta.duckdns.org/health
pm2 logs basita-api
```

## PM2 Commands
```bash
pm2 reload ecosystem.config.js --env production
pm2 restart basita-api
pm2 logs basita-api --lines 100
pm2 status
```

## CI/CD
GitHub Actions deploys on push to `main` via SSH (`appleboy/ssh-action@v1`) using secrets:
- VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT
- All env vars prefixed `PROD_`
```
