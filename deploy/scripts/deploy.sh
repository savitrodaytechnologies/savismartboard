#!/bin/bash
# deploy/scripts/deploy.sh
# Called by GitHub Actions on every push to main.
# Can also be run manually on the EC2.
#
# Environment variables expected (passed by CI or set before running manually):
#   SMARTBOARD_DB_CONNSTR     — full ADO.NET connection string (no quotes)
#   SMARTBOARD_AI_TEXT_KEY    — DeepSeek API key  (sk-...)       — required for AI Assist text prompts
#   SMARTBOARD_AI_VISION_KEY  — Anthropic API key (sk-ant-...)   — required for AI Assist vision (lasso)
#   DEPLOY_DIR                — directory containing api.tar.gz + www.tar.gz
#                               (default: /tmp/smartboard-deploy)
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/tmp/smartboard-deploy}"
API_DIR=/opt/smartboard/api
WWW_DIR=/opt/smartboard/www
ENV_FILE=/opt/smartboard/env

echo "==> [1/5] Updating env file"
if [ -n "${SMARTBOARD_DB_CONNSTR:-}" ]; then
    # Always start fresh from the DB connection string
    printf 'ConnectionStrings__Smartboard=%s\n' "$SMARTBOARD_DB_CONNSTR" > "$ENV_FILE"

    # AI provider keys — optional but required for AI Assist to work.
    # Set SMARTBOARD_AI_TEXT_KEY (DeepSeek) and SMARTBOARD_AI_VISION_KEY (Anthropic/Copilot)
    # as GitHub Actions secrets and they will be injected here.
    [ -n "${SMARTBOARD_AI_TEXT_KEY:-}" ]   && printf 'Ai__Providers__deepseek__ApiKey=%s\n'  "$SMARTBOARD_AI_TEXT_KEY"   >> "$ENV_FILE"
    [ -n "${SMARTBOARD_AI_VISION_KEY:-}" ] && printf 'Ai__Providers__copilot__ApiKey=%s\n'  "$SMARTBOARD_AI_VISION_KEY" >> "$ENV_FILE"
    [ -n "${SMARTBOARD_AI_VISION_KEY:-}" ] && printf 'Ai__Providers__anthropic__ApiKey=%s\n' "$SMARTBOARD_AI_VISION_KEY" >> "$ENV_FILE"

    chmod 600 "$ENV_FILE"
    echo "     env file updated."
else
    echo "     SMARTBOARD_DB_CONNSTR not set — keeping existing env file."
fi

echo "==> [2/5] Stopping smartboard-api"
sudo systemctl stop smartboard-api

echo "==> [3/5] Deploying API"
rm -rf "${API_DIR:?}"/*
tar -xzf "$DEPLOY_DIR/api.tar.gz" -C "$API_DIR/"
echo "     API deployed."

echo "==> [4/5] Deploying frontend"
rm -rf "${WWW_DIR:?}"/*
tar -xzf "$DEPLOY_DIR/www.tar.gz" -C "$WWW_DIR/"
echo "     Frontend deployed."

echo "==> [5/5] Starting smartboard-api"
sudo systemctl start smartboard-api

# Reload the shared nginx container (handles teach.svais.net → port 5000)
if sudo docker inspect saviknowledgebot-nginx-1 &>/dev/null; then
    sudo docker exec saviknowledgebot-nginx-1 nginx -s reload 2>/dev/null && echo "     nginx reloaded." || true
fi

sleep 3
sudo systemctl status smartboard-api --no-pager --lines 5

echo ""
echo "==> Deploy complete. Health check:"
curl -sf http://localhost:5000/healthz && echo " OK" || echo " WARN: health check failed — check logs: journalctl -u smartboard-api -n 50"
