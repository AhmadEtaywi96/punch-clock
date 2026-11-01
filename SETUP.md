# Punch Clock – Setup Guide

```
punch-clock/
  server/   Express API + serves the built PWA (one process, one origin)
  client/   Angular PWA
```

## 1. Google Service Account & Sheet

1. Go to https://console.cloud.google.com → create (or pick) a project.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account** (e.g. `punch-clock`). No roles needed → Done.
4. Open the account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads. Keep it private.
5. From that JSON copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key`  → `GOOGLE_PRIVATE_KEY` (paste exactly as shown in the JSON, in double quotes, on one line with the literal `\n` sequences)
6. Create the Google Sheet. Add a header row: `Name | Email | Timestamp | Action | Location`.
7. **Share** the sheet with the service-account email as **Editor** (uncheck "notify").
8. Sheet ID = the part of the URL between `/d/` and `/edit` → `GOOGLE_SHEET_ID`.
   If your tab isn't called `Sheet1`, set `SHEET_TAB`.

## 2. Oracle Cloud VM: open ports

The Geolocation API only works on **HTTPS** (or localhost), so you need a domain and a TLS certificate.

1. **Domain:** point an A record (e.g. `punch.yourdomain.com`) at the VM's public IP.
   No domain? A free DuckDNS subdomain (https://www.duckdns.org) works.
2. **OCI console → Networking → VCN → Subnet → Security List → Add Ingress Rules:**
   source `0.0.0.0/0`, TCP, destination ports `80` and `443`.
3. **On the VM:** Oracle's Ubuntu images also block ports in iptables:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 3. Node, PM2, and the app

```bash
# Node LTS + PM2
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -   # Angular 22 needs Node 22.22+ / 24.15+
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Copy the project to the VM (git clone / scp), then:
cd ~/punch-clock/client && npm ci && npx ng build      # -> client/dist/client/browser
cd ~/punch-clock/server && npm ci --omit=dev
cp .env.example .env && nano .env                     # fill in real values, choose a strong PIN
chmod 600 .env

pm2 start ecosystem.config.js
pm2 save
pm2 startup        # run the command it prints, so the app restarts on reboot
```

The server listens on `127.0.0.1:PORT` only. Nginx exposes it to the internet.

## 4. Nginx + HTTPS (Let's Encrypt)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/punch-clock >/dev/null <<'EOF'
server {
    listen 80;
    server_name punch.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/punch-clock /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d punch.yourdomain.com --redirect   # issues cert + forces HTTPS
sudo certbot renew --dry-run                              # confirms auto-renewal works
```

Check it: `curl https://punch.yourdomain.com/api/health` → `{"ok":true}`

## 5. Install on your phone

Open `https://punch.yourdomain.com` and enter your PIN.
- **Android/Chrome:** menu → *Install app* / *Add to Home screen*.
- **iPhone/Safari:** Share → *Add to Home Screen*.

Allow location access when prompted.

## Updating later

```bash
cd ~/punch-clock && git pull
cd client && npm ci && npx ng build
cd ../server && npm ci --omit=dev && pm2 restart punch-clock
```

## Local development

```bash
cd server && cp .env.example .env   # real values
npm start                            # http://localhost:3000
cd ../client && npx ng serve         # http://localhost:4200, /api is proxied to :3000
```
