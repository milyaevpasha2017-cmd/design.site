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
 if(!response.ok||data.ok!==true){
  const messages={relay_auth:'Worker rejected the server token: Cloudflare secret and server token differ.',telegram_api:'Worker reached Telegram, but Telegram rejected the request.'};
  const transport={timeout:'Cloudflare to Telegram timeout.',type_error:'Cloudflare fetch TypeError.',network:'Cloudflare to Telegram network failure.'};
  const detail=data.stage==='telegram_transport'?(transport[data.reason]||'Cloudflare transport failed.'):data.stage==='telegram_response'?'Telegram returned a non-JSON response.':messages[data.stage]||'Worker returned an error.';
  process.stdout.write('HTTP '+response.status+'. '+detail);process.exit(1);
 }
 if(data.result?.username!=='epiphany_int_bot'){process.stdout.write('Bot identity differs from epiphany_int_bot.');process.exit(1);} 
 process.stdout.write('verified');
}catch(error){process.stdout.write(error?.code==='TELEGRAM_TIMEOUT'?'Connection timed out.':'Transport or response error.');process.exit(1);}
'''
    checked = subprocess.run(['/usr/bin/node', '--input-type=module', '-e', script],
        cwd=ROOT, input=json.dumps({'token': token, 'relay': relay}), text=True,
        capture_output=True, timeout=30, check=False)
    if checked.returncode or checked.stdout != 'verified':
        detail = checked.stdout.strip()
        if not re.fullmatch(r'[A-Za-z0-9 .:_-]{1,240}', detail):
            detail = 'Local transport failed; no credentials printed.'
        raise RuntimeError('Relay check failed: ' + detail + ' Settings unchanged')
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
