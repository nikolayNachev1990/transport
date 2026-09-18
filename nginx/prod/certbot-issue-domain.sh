#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${NGINX_SSL_EMAIL:-}"

WEBROOT="/var/www/certbot"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
CERT_PATH="${CERT_DIR}/fullchain.pem"

die(){ echo "ERROR: $*" >&2; exit 1; }

[[ -n "$DOMAIN" ]] || die "Usage: certbot-issue-domain.sh <domain>"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "Invalid domain format: $DOMAIN"
[[ "$DOMAIN" == *.* ]] || die "Domain must contain a dot: $DOMAIN"
[[ -n "$EMAIL" ]] || die "NGINX_SSL_EMAIL env var is required (email for Let's Encrypt)."

mkdir -p "$WEBROOT"

if [[ -f "$CERT_PATH" ]]; then
  echo "Certificate already exists for ${DOMAIN}: ${CERT_PATH}"
  exit 0
fi

echo "Issuing new certificate for ${DOMAIN} using webroot (${WEBROOT})..."

# If you need both root + www, add: -d "www.${DOMAIN}"
certbot certonly \
  --webroot -w "$WEBROOT" \
  --non-interactive --agree-tos \
  -m "$EMAIL" \
  -d "$DOMAIN"

echo "Certificate created for ${DOMAIN}."

echo "Reloading nginx..."
OUT="$(nginx -s reload 2>&1 || true)"
echo "$OUT"

# nginx -s reload usually returns empty output on success.
# If it errors, it will output something like "nginx: [emerg] ..."
if echo "$OUT" | grep -qi "nginx: \[emerg\]"; then
  die "nginx reload failed."
fi

echo "✅ Done."