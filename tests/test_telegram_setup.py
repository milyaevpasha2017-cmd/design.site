import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vps'))
spec = importlib.util.spec_from_file_location('telegram_setup', Path(__file__).resolve().parents[1] / 'vps/setup-telegram.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class TelegramSetupTest(unittest.TestCase):
    def test_api_error_is_actionable_without_exposing_token_or_url(self):
        token = '123456:synthetic_token_that_must_not_be_printed'
        url = 'https://api.telegram.org/bot' + token + '/getUpdates'
        failure = HTTPError(url, 409, 'Conflict', None, io.BytesIO(json.dumps({'description': 'Conflict: webhook active ' + url + ' ' + token}).encode()))
        with patch.object(setup, 'open_telegram', side_effect=failure):
            with self.assertRaises(RuntimeError) as context: setup.telegram_call(token, 'getUpdates', {})
        message = str(context.exception)
        self.assertIn('getUpdates: HTTP 409', message)
        self.assertNotIn(token, message)
        self.assertNotIn('https://', message)

    def test_transport_retries_reads_but_not_send_message(self):
        for method, attempts in [('getUpdates', 3), ('sendMessage', 1)]:
            with patch.object(setup, 'open_telegram', side_effect=URLError('private URL')), patch.object(setup.time, 'sleep'), self.subTest(method=method):
                with self.assertRaises(RuntimeError): setup.telegram_call('synthetic', method, {})
                self.assertEqual(setup.open_telegram.call_count, attempts)

    def test_transport_uses_only_ipv4_and_keeps_https_verification(self):
        import telegram_transport
        with patch.object(telegram_transport.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('149.154.166.110',443))]) as lookup, patch.object(telegram_transport.socket, 'socket') as factory:
            result = telegram_transport.ipv4_connection(('api.telegram.org',443),10)
            lookup.assert_called_once_with('api.telegram.org',443,telegram_transport.socket.AF_INET,telegram_transport.socket.SOCK_STREAM)
            result.connect.assert_called_once_with(('149.154.166.110',443))
        connection=telegram_transport.IPv4HTTPSConnection('api.telegram.org')
        self.assertTrue(connection._context.check_hostname)
        self.assertEqual(connection._context.verify_mode,2)
