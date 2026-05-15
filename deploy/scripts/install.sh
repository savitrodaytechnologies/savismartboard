#!/bin/bash
# deploy/scripts/install.sh
# One-time setup on Amazon Linux 2023 EC2.
# Run ONCE as ec2-user with sudo:   sudo bash install.sh
set -euo pipefail

echo "==> [1/7] Installing .NET 8 runtime"
dnf install -y aspnetcore-runtime-8.0

echo "==> [2/7] Installing nginx"
dnf install -y nginx
systemctl enable nginx
systemctl start nginx

echo "==> [3/7] Creating app directories"
mkdir -p /opt/smartboard/{api,www,logs}
chown -R ec2-user:ec2-user /opt/smartboard

echo "==> [4/7] Creating env file (secrets go here — never in git)"
if [ ! -f /opt/smartboard/env ]; then
    cat > /opt/smartboard/env << 'EOF'
# ── Populated by GitHub Actions deploy on every push to main ──────────────
# Do not edit manually (changes will be overwritten on next deploy).
# To test locally: fill in the values below.
ConnectionStrings__Smartboard=Server=rdsexpserver.ccmuwbvpbelg.ap-south-1.rds.amazonaws.com,1433;Database=savismartboard;User Id=smartuser;Password=CHANGE_ME;Encrypt=True;TrustServerCertificate=False;
ASPNETCORE_ENVIRONMENT=Production
EOF
fi
chmod 600 /opt/smartboard/env
chown ec2-user:ec2-user /opt/smartboard/env

echo "==> [5/7] Installing systemd service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/../systemd/smartboard-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable smartboard-api

echo "==> [6/7] Installing nginx site config"
cp "$SCRIPT_DIR/../nginx/smartboard.conf" /etc/nginx/conf.d/smartboard.conf
nginx -t
systemctl reload nginx

echo "==> [7/7] Granting ec2-user passwordless sudo for service management only"
cat > /etc/sudoers.d/smartboard << 'SUDOEOF'
# Allow ec2-user to manage the smartboard service (for CI/CD deploy)
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl start smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart smartboard-api
ec2-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
SUDOEOF
chmod 440 /etc/sudoers.d/smartboard
visudo -cf /etc/sudoers.d/smartboard

echo ""
echo "==> Install complete."
echo "    Next: trigger a GitHub Actions deploy, or run deploy.sh manually."
