#!/usr/bin/env python3
"""Verify the relay with getMe before changing the existing server configuration."""
import json
import os
import re
import subprocess
from notification_config import CONFIG, ROOT, save


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    relay = input('Cloudflare Worker URL: ').strip().rstrip('/')
    if not re.fullmatch(r'https://epiphany-telegram-relay\.[a-z0-9-]+\.workers\.dev', relay):
        raise RuntimeError('Expected https://epiphany-telegram-relay.<account>.workers.dev')
    config = dict(line.split('=', 1) for line in CONFIG.read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    token = config.get('TELEGRAM_BOT_TOKEN', '')
    if not re.fullmatch(r'[0-9]{5,15}:[A-Za-z0-9_-]{25,100}', token):
        raise RuntimeError('Existing bot token is missing or invalid')
    if config.get('TELEGRAM_CHAT_ID') != '653315064':
        raise RuntimeError('Designer chat differs from relay configuration; nothing changed')
    script = '''
import {telegramFetch} from './vps/telegram.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
try{
 const c=JSON.parse(input);
 const response=await telegramFetch('https://api.telegram.org/bot'+c.token+'/getMe',{body:'{}'},{TELEGRAM_RELAY_URL:c.relay});
 const data=await response.json();
 if(!response.ok||data.ok!==true||data.result?.username!=='epiphany_int_bot')process.exit(1);
 process.stdout.write('verified');
}catch{process.exit(1);}
'''
    checked = subprocess.run(['/usr/bin/node', '--input-type=module', '-e', script],
        cwd=ROOT, input=json.dumps({'token': token, 'relay': relay}), text=True,
        capture_output=True, timeout=30, check=False)
    if checked.returncode or checked.stdout != 'verified':
        raise RuntimeError('Relay check failed. Check Worker URL and TELEGRAM_BOT_TOKEN secret. Settings unchanged')
    save({'TELEGRAM_RELAY_URL': relay})
    applied = subprocess.run(['systemctl', 'restart', 'epiphany'], check=False)
    if applied.returncode:
        raise RuntimeError('Saved, but restart failed. Run: systemctl restart epiphany')
    print('Relay verified and enabled. In the admin panel, retry one undelivered notification and check Telegram.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Setup stopped; check service status before retrying')
        raise SystemExit(1)
