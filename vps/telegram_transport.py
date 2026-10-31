"""Telegram API via the server's curl: IPv4, verified HTTPS, credentials on stdin."""
import json
import subprocess


def curl_config(url, payload):
    if not url.startswith('https://api.telegram.org/bot') or any(c in url for c in '\r\n'):
        raise ValueError('Unexpected Telegram endpoint')
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    return 'url = ' + quote(url) + '\nrequest = "POST"\nheader = "Content-Type: application/json"\ndata = ' + quote(json.dumps(payload, ensure_ascii=False)) + '\n'


def telegram_request(url, payload, timeout=20):
    # Token URL and JSON body are in stdin, never argv/environment or diagnostics.
    args = ['/usr/bin/curl', '--disable', '-4', '--silent', '--show-error',
            '--connect-timeout', '10', '--max-time', str(timeout),
            '--max-filesize', '1048576', '--proto', '=https',
            '--config', '-', '--write-out', '\n%{http_code}']
    try:
        response = subprocess.run(args, input=curl_config(url, payload),
            text=True, capture_output=True, timeout=timeout + 3, check=False,
            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    except Exception:
        raise RuntimeError('Telegram connection failed') from None
    if response.returncode:
        # curl codes are safe diagnostics; stderr may contain the token URL.
        raise RuntimeError('Telegram connection failed (curl code ' + str(response.returncode) + ')')
    try:
        body, status = response.stdout.rsplit('\n', 1)
        return int(status), json.loads(body)
    except Exception:
        raise RuntimeError('Telegram returned an unreadable response') from None
