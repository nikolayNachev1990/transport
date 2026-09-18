# =============================================================================
#  nginx 
#  context:  nginx/
# =============================================================================


# --- base: ------------------------------------------
FROM nginx:1.27-bookworm AS base

# nginx-extras  
# luarocks/gcc 
# certbot      
RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        curl \
        ca-certificates \
        gettext-base \
        nginx-extras \
        certbot \
        python3-certbot-nginx \
        cron \
        lua5.1 \
        luarocks \
        libssl-dev \
        gcc \
        make \
    && luarocks install luaossl \
    && apt-get purge -y --auto-remove gcc make libssl-dev luarocks \
    && rm -rf /var/lib/apt/lists/*

RUN rm -f /etc/nginx/conf.d/default.conf \
          /etc/nginx/sites-enabled/default \
          /etc/nginx/sites-available/default

RUN mkdir -p /home/nginx-logs && chown -R nginx:nginx /home/nginx-logs

EXPOSE 80 443


# --- local ------------------------------------------------------------------
FROM base AS local

COPY ./local/conf.d/  /etc/nginx/conf.d/
COPY ./local/startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD curl -fsS http://127.0.0.1/healthz || exit 1

CMD ["/usr/local/bin/startup.sh"]


# --- prod -------------------------------------------------------------------
FROM base AS prod

COPY ./prod/conf.d/ /etc/nginx/conf.d/
COPY ./prod/startup.sh              /usr/local/bin/startup.sh
COPY ./prod/certbot_renew.sh        /usr/local/bin/certbot_renew.sh
COPY ./prod/certbot-issue-domain.sh /usr/local/bin/certbot-issue-domain.sh
RUN chmod +x /usr/local/bin/startup.sh \
             /usr/local/bin/certbot_renew.sh \
             /usr/local/bin/certbot-issue-domain.sh

RUN echo "0 0 * * * root /usr/local/bin/certbot_renew.sh >> /var/log/cron.log 2>&1" \
        > /etc/cron.d/certbot-renew \
    && chmod 0644 /etc/cron.d/certbot-renew

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD curl -fsS http://127.0.0.1/healthz || exit 1

CMD ["/usr/local/bin/startup.sh"]
