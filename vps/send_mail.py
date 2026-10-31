"""SMTP with verified TLS, credentials only in the server environment, no sensitive logs."""
import base64
from email.message import EmailMessage
from email.utils import formatdate
import json
import os
import re
import smtplib
import ssl
import sys


def address(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r'[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+', value):
        raise ValueError('Invalid mail address')
    return value


def send(config, payload):
    host = config['SMTP_HOST']
    if not re.fullmatch(r'[A-Za-z0-9.-]+', host): raise ValueError('Invalid SMTP host')
    port = int(config.get('SMTP_PORT', '465'))
    if port not in (465, 587): raise ValueError('TLS SMTP port required')
    sender, recipient = address(config['SMTP_FROM']), address(payload['to'])
    message = EmailMessage()
    message['From'], message['To'] = sender, recipient
    message['Subject'] = 'Заявка с сайта Epiphany Interior'
    message['Date'] = formatdate(localtime=False)
    reference = payload.get('id', '')
    if re.fullmatch(r'[0-9a-f-]{36}', reference):
        message['Message-ID'] = '<epiphany-' + reference + '@' + sender.split('@')[1] + '>'
    message.set_content(payload['text'])
    context = ssl.create_default_context()
    smtp = smtplib.SMTP_SSL(host, port, timeout=15, context=context) if port == 465 else smtplib.SMTP(host, port, timeout=15)
    try:
        if port == 587:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(config['SMTP_USER'], base64.b64decode(config['SMTP_PASSWORD_B64'], validate=True).decode())
        refused = smtp.send_message(message)
        if refused: raise RuntimeError('Recipient refused')
    finally:
        # Acceptance is already confirmed; a failed QUIT must not trigger a duplicate.
        try: smtp.quit()
        except Exception: smtp.close()


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(24001)
        if len(raw) > 24000: raise ValueError('Message too large')
        send(os.environ, json.loads(raw))
    except Exception:
        raise SystemExit(1) from None
