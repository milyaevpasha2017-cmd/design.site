#!/usr/bin/env python3
"""Enter bot credentials on the server; never put them in chat or shell history."""
import getpass
import json
import os
import re
import urllib.request
from urllib.parse import urlsplit
from notification_config import contacts, save


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    expected = urlsplit(contacts()['telegram']).path.strip('/').lower()
    if not re.fullmatch(r'[a-z0-9_]{5,32}', expected): raise RuntimeError('Invalid designer Telegram contact on website')
    print('Designer from website: @' + expected)
    token = getpass.getpass('Bot token (hidden): ').strip()
    if not re.fullmatch(r'[0-9]{5,15}:[A-Za-z0-9_-]{25,100}', token):
        raise RuntimeError('Invalid token format; nothing changed')
    def call(method, payload):
        request = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method,
            data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                result = json.load(response)
            if result.get('ok') is not True:
                raise ValueError()
            return result['result']
        except Exception:
            raise RuntimeError('Telegram request failed. Check token, bot access and connection; nothing changed') from None
    bot = call('getMe', {})
    print('Bot: @' + bot['username'])
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
