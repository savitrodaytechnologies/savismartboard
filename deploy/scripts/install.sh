#!/bin/bash
# deploy/scripts/install.sh
# One-time setup on Amazon Linux 2023 EC2.
# Run ONCE as ec2-user with sudo:   sudo bash install.sh
set -euo pipefail

echo "==> [1/8] Installing .NET 8 runtime"
dnf install -y aspnetcore-runtime-8.0

echo "==> [2/8] Installing nginx + certbot"
dnf install -y nginx python3-certbot-nginx
systemctl enable nginx
systemctl start nginx

echo "==> [3/8] Creating app directories"
mkdir -p /opt/smartboard/{api,www,logs}
chown -R ec2-user:ec2-user /opt/smartboard

echo "==> [4/8] Creating env file (secrets go here — never in git)"
if [ ! -f /opt/smartboard/env ]; then
    cat > /opt/smartboard/env << 'EOF'
# ── Populated by GitHub Actions deploy on every push to main ──────────────
# Do not edit manually (changes will be overwritten on next deploy).
# To test locally: fill in the values below.
ConnectionStrings__Smartboard=Server=rdsexpserver.ccmuwbvpbelg.ap-south-1.rds.amazonaws.com,1433;Database=savismartboard;User Id=smartuser;Password=CHANGE_ME;Encrypt=True;TrustServerCertificate=False;
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5000
EOF
fi
chmod 600 /opt/smartboard/env
chown ec2-user:ec2-user /opt/smartboard/env

echo "==> [5/8] Installing systemd service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/../systemd/smartboard-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable smartboard-api

echo "==> [6/8] Installing nginx site config"
cp "$SCRIPT_DIR/../nginx/smartboard.conf" /etc/nginx/conf.d/smartboard.conf
nginx -t
systemctl reload nginx

echo "==> [7/8] Granting ec2-user passwordless sudo for service management only"
cat > /etc/sudoers.d/smartboard << 'SUDOEOF'
# Allow ec2-user to manage the smartboard service (for CI/CD deploy)
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl start smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
SUDOEOF
chmod 440 /etc/sudoers.d/smartboard
visudo -cf /etc/sudoers.d/smartboard

echo "==> [8/8] Opening firewall port 80 + 443 (if firewalld is running)"
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo "     firewalld updated."
else
    echo "     firewalld not active — ensure EC2 Security Group allows 80 + 443 inbound."
fi

echo ""
echo "==> Install complete."
echo "    1. Trigger a GitHub Actions deploy (push to main) to get the app files."
echo "    2. After DNS propagates, run:"
echo "       sudo certbot --nginx -d teach.svais.net --non-interactive --agree-tos -m admin@svais.net"
