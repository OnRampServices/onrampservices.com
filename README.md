# onrampservices.com

Marketing site for OnRamp Services, with a static frontend and a small Node API used by the contact form.

## Stack

- Static site files served by Caddy
- Node.js contact API (`server.js`)
- SMTP delivery through `mx.otnh.net` on submission port `587` with STARTTLS

## Local development

### Static site

You can open `index.html` directly for simple content edits, but the contact form requires the API.

### API

1. Install dependencies:

```bash
npm install
```

2. Create an env file from the example:

```bash
cp .env.example .env
```

3. Fill in the required values:

```env
PORT=3000
ALLOWED_ORIGIN=https://onrampservices.com
CONTACT_FORM_TOKEN=onramp-contact-v1
CONTACT_MIN_SUBMIT_MS=4000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=5
SMTP_HOST=mx.otnh.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<mailbox username>
SMTP_PASS=<mailbox password>
SMTP_FROM=<authenticated sender mailbox>
CONTACT_TO=<destination mailbox>
```

4. Run the API:

```bash
node server.js
```

The frontend posts to:

- `POST /api/contact`

## Production wiring

Current production host:

- **US web server / Ionos web server**
- host/IP: `us.otnh.net` / `66.179.138.43`

### Site paths on the server

- repo checkout: `/opt/sites/onrampservices.com`
- static web root: `/var/www/onrampservices.com`
- env file: `/opt/sites/onrampservices.com/.env`

### API service

Systemd unit:

- `onrampservices-api.service`

Useful commands:

```bash
sudo systemctl status onrampservices-api
sudo systemctl restart onrampservices-api
journalctl -u onrampservices-api -n 100 --no-pager
```

### Caddy

Caddy serves the static site and reverse proxies API traffic:

- site: `onrampservices.com`
- proxied path: `/api/* -> 127.0.0.1:3000`

### Deploy automation

GitHub webhook deploys are handled on the US VPS by:

- listener: `/opt/deploy/webhook_listener.py`
- service: `github-deploy-webhook.service`
- deploy script: `/opt/deploy/scripts/deploy_onrampservices.sh`

Current deploy behavior:

1. pull latest `main`
2. run `npm install --omit=dev`
3. sync static files into `/var/www/onrampservices.com`
4. restart `onrampservices-api`
5. reload Caddy

## Mail delivery notes

The contact form is wired to authenticated SMTP on `mx.otnh.net:587`, not port `25`.

Important:

- use a real mailbox for `SMTP_USER`
- use a valid authenticated mailbox for `SMTP_FROM`
- set `CONTACT_TO` to a mailbox that actually exists

If the form fails with a generic send error, check:

- `journalctl -u onrampservices-api -n 100 --no-pager`
- Mailcow/Postfix logs on `mx.otnh.net`
- `.env` values for `SMTP_FROM` and `CONTACT_TO`
