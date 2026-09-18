#!/bin/bash

# Renew the SSL certificate (certbot only renews certs within 30 days of
# expiry; --force-renewal here would burn through Let's Encrypt's
# duplicate-certificate rate limit since this runs daily).
certbot renew --webroot -w /var/www/certbot --quiet


# Reload Nginx to apply the new certificate if renewed
nginx -s reload
