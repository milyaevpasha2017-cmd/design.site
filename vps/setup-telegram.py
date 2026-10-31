#!/usr/bin/env python3
"""Enter bot credentials on the server; never put them in chat or shell history."""
import getpass
import json
import os
import re
import urllib.request
import urllib.error
import time
from urllib.parse import urlsplit
from notification_config import contacts, save
from telegram_transport import open_telegram


def telegram_call(token, method, payload):
    # Retry only read-only API calls; sendMessage may have been accepted already.
    attempts = 3 if method in ('getMe', 'getWebhookInfo', 'getUpdates') else 1
    for attempt in range(attempts):
        request = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method,
            data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        try:
            with open_telegram(request, timeout=15) as response:
                result = json.load(response)
        except urllib.error.HTTPError as failure:
            try: result = json.loads(failure.read(4096))
            except Exception: result = {}
            code = failure.code
        except Exception:
            if attempt + 1 < attempts:
                time.sleep(1)
                continue
            raise RuntimeError(method + ': connection failed or timed out. Token was not printed; settings unchanged') from None
        else:
            if result.get('ok') is True: return result['result']
            code = result.get('error_code', 'unknown')
        # Report API reason, never URLs or raw exceptions containing the token.
        description = str(result.get('description', 'Telegram rejected the request')).replace(token, '[hidden]')
        description = re.sub(r'https?://\S+', '[URL hidden]', description)
        description = re.sub(r'\b[0-9]{5,15}:[A-Za-z0-9_-]{20,}', '[hidden]', description)
        description = ' '.join(description.split())[:240]
        raise RuntimeError(method + ': HTTP ' + str(code) + '. ' + description + '. Settings unchanged') from None


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    expected = urlsplit(contacts()['telegram']).path.strip('/').lower()
    if not re.fullmatch(r'[a-z0-9_]{5,32}', expected): raise RuntimeError('Invalid designer Telegram contact on website')
    print('Designer from website: @' + expected)
    token = getpass.getpass('Bot token (hidden): ').strip()
    if not re.fullmatch(r'[0-9]{5,15}:[A-Za-z0-9_-]{25,100}', token):
        raise RuntimeError('Invalid token format; nothing changed')
    call = lambda method, payload: telegram_call(token, method, payload)
    bot = call('getMe', {})
    print('Bot: @' + bot['username'])
    if call('getWebhookInfo', {}).get('url'):
        raise RuntimeError('This bot already has a webhook from another service. It was NOT changed. Use a dedicated bot or review the existing integration')
    print('Ask the DESIGNER @' + expected + ' to open this bot and send: /start')
    input('Then press Enter here: ')
    updates = call('getUpdates', {'allowed_updates': ['message'], 'limit': 100, 'timeout': 0})
    chats = {str(item['message']['chat']['id']): item['message']['chat'] for item in updates
             if item.get('message', {}).get('chat', {}).get('type') == 'private'
             and item['message'].get('from', {}).get('username', '').lower() == expected}
    if not chats:
        raise RuntimeError('No designer chat found. Ask @' + expected + ' to send /start and run setup again')
    for chat_id, chat in chats.items():
        print('Chat ID: ' + chat_id + ' — ' + chat.get('first_name', '') + ' @' + chat.get('username', ''))
    selected = input('Enter the DESIGNER chat ID from the list above: ').strip()
    if selected not in chats:
        raise RuntimeError('Select a chat from the displayed list; nothing changed')
    call('sendMessage', {'chat_id': selected, 'text': 'Epiphany Interior: уведомления о заявках подключены. Контакты клиентов доступны только в админке сайта.'})
    save({'TELEGRAM_BOT_TOKEN': token, 'TELEGRAM_CHAT_ID': selected})
    print('Saved securely. Apply with: systemctl restart epiphany')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Setup stopped; check configuration before retrying')
        raise SystemExit(1)
