#!/bin/bash

# Webroot used for HTTP-01 ACME challenges (both initial webroot issuance
# via certbot-issue-domain.sh and cron renewal via certbot_renew.sh need
# this to exist before certbot/nginx touch it).
CERTBOT_WEBROOT="/var/www/certbot"
if [ ! -d "$CERTBOT_WEBROOT" ]; then
    mkdir -p "$CERTBOT_WEBROOT"
fi

# Self-signed fallback cert for the default_server 443 block (default.conf.template).
# Only used until real certs exist for a domain, so it's generated once and reused.
SELFSIGNED_DIR="/etc/nginx/ssl"
SELFSIGNED_CRT="$SELFSIGNED_DIR/default-selfsigned.crt"
SELFSIGNED_KEY="$SELFSIGNED_DIR/default-selfsigned.key"

if [ ! -f "$SELFSIGNED_CRT" ] || [ ! -f "$SELFSIGNED_KEY" ]; then
    echo "Self-signed default certificate not found. Generating it."
    mkdir -p "$SELFSIGNED_DIR"
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$SELFSIGNED_KEY" \
        -out "$SELFSIGNED_CRT" \
        -subj "/CN=invalid"
    chmod 644 "$SELFSIGNED_KEY" "$SELFSIGNED_CRT"
else
    echo "Self-signed default certificate already exists."
fi

create_certificate() {
    local domain="$1"

    if [ -z "$domain" ]; then
        return
    fi

    CERT_PATH="/etc/letsencrypt/live/$domain/fullchain.pem"

    if [ ! -f "$CERT_PATH" ]; then
        echo "Certificate not found for $domain. Attempting to create it."

        certbot certonly \
            --standalone \
            --non-interactive \
            --agree-tos \
            -m "$NGINX_SSL_EMAIL" \
            -d "$domain"
    else
        echo "Certificate already exists for $domain."
    fi
}

# Single domain support
if [ -n "$DOMAIN" ]; then
    create_certificate "$DOMAIN"
else
    echo "DOMAIN is empty. Skipping single domain certificate creation."
fi

# Multiple domains support: server1.domain.com,server2.domain.com,server3.domain.com
if [ -n "$DOMAINS" ]; then
    IFS=',' read -ra DOMAIN_LIST <<< "$DOMAINS"

    for domain in "${DOMAIN_LIST[@]}"; do
        # trim spaces
        domain="$(echo "$domain" | xargs)"
        create_certificate "$domain"
    done
else
    echo "DOMAINS is empty. Skipping multiple domain certificate creation."
fi

# Check for logs directory, if not exists will create it.
NGINX_LOG_DIR="/home/nginx-logs/"
if [ ! -d "$NGINX_LOG_DIR" ]; then
    mkdir -p "$NGINX_LOG_DIR"
    chmod 777 "$NGINX_LOG_DIR"
fi

# Render nginx conf templates. $${ESC}xxx in the templates becomes $xxx here,
# since ESC is intentionally never set as an env var and envsubst drops it.
for template in /etc/nginx/conf.d/*.template; do
    [ -e "$template" ] || continue
    envsubst < "$template" > "${template%.template}"
done

# Start Cron in the background for certificate renewal
service cron start


# Start Nginx in the foreground
nginx -g "daemon off;"