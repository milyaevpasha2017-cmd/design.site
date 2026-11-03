# Telegram delivery through Cloudflare

Timeweb remains the source of truth for leads and retries. The separate
`epiphany-telegram-relay` Worker forwards authenticated POST requests only to
`getMe` and `sendMessage` for the configured bot and designer chat 653315064.
It does not store leads, forward incoming headers, follow redirects, expose bot
tokens in inbound URLs or retry ambiguous sends. A timeout may mean Telegram
accepted the message without returning an acknowledgement; later retries can
therefore duplicate a notification. Match its lead ID before processing.

## Activation

1. The GitHub workflow **Publish Telegram relay** deploys the Worker using the
   existing Cloudflare account ID/API token secrets. If the token is scoped only
   to another Worker, grant this Worker deployment permission in Cloudflare.
2. In Cloudflare Workers & Pages, open **epiphany-telegram-relay** → Settings →
   Variables and Secrets. Add **Secret** `TELEGRAM_BOT_TOKEN` with the existing
   token for `@epiphany_int_bot` and deploy the change. Never paste it into source,
   GitHub plaintext variables, a URL, logs or chat.
3. Copy the Worker's `https://epiphany-telegram-relay.<account>.workers.dev` URL.
4. On Timeweb, run `python3 /opt/epiphany/current/vps/setup-telegram-relay.py`
   and paste that URL at the prompt. It reads the existing local credentials,
   checks `getMe` from the VPS through the Worker, saves `TELEGRAM_RELAY_URL`
   only on success, and restarts the service. No new bot token entry is needed.
5. Retry one undelivered notification in the admin panel and confirm receipt in
   the designer's Telegram. Pending automatic retries keep their schedules;
   exhausted notifications need the retry button. Sent notifications are untouched.

Deployment alone does not activate relay routing. Until step 4, the original
direct IPv4 transport stays active. Only authenticated delivery success marks a
lead notified. Email fallback remains unconfigured until separately set up.

To revert, remove only `TELEGRAM_RELAY_URL` from `/etc/epiphany/server.env` and
restart `epiphany`. Do not replace or print the entire configuration file.
The VPS must be able to reach this workers.dev hostname; Cloudflare cannot
guarantee connectivity from every provider. The setup check tests that route.
