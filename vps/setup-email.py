#!/usr/bin/env python3
import base64
import getpass
import os
from notification_config import contacts, save
from send_mail import send, address


def main():
    if os.geteuid() != 0: raise RuntimeError('Run as root')
    recipient = address(contacts()['email'])
    print('Designer email from website: ' + recipient)
    config = {
        'SMTP_HOST': input('Sending mailbox SMTP host [smtp.yandex.ru]: ').strip() or 'smtp.yandex.ru',
        'SMTP_PORT': input('SMTP TLS port [465]: ').strip() or '465',
        'SMTP_USER': input('Sending mailbox login: ').strip(),
        'SMTP_FROM': address(input('Sending mailbox email (From): ').strip())}
    password = getpass.getpass('Mailbox APP password (hidden): ')
    if not password or not config['SMTP_USER']: raise RuntimeError('Missing credentials')
    config['SMTP_PASSWORD_B64'] = base64.b64encode(password.encode()).decode()
    send(config, {'to': recipient, 'text': 'Epiphany Interior: резервная доставка заявок по почте подключена. Это тестовое письмо.'})
    save(config)
    print('Mail server accepted test email to ' + recipient + '. Check Inbox and Spam.')
    print('Saved securely. Apply with: systemctl restart epiphany')


if __name__ == '__main__':
    try: main()
    except (Exception, KeyboardInterrupt):
        print('Setup failed. Check SMTP settings and credentials. No credentials were printed.')
        raise SystemExit(1) from None
