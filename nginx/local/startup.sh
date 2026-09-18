#!/bin/bash

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

# Start Nginx in the foreground
nginx -g "daemon off;"