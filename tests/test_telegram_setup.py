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
        with patch.object(setup.urllib.request, 'urlopen', side_effect=failure):
            with self.assertRaises(RuntimeError) as context: setup.telegram_call(token, 'getUpdates', {})
        message = str(context.exception)
        self.assertIn('getUpdates: HTTP 409', message)
        self.assertNotIn(token, message)
        self.assertNotIn('https://', message)

    def test_transport_retries_reads_but_not_send_message(self):
        for method, attempts in [('getUpdates', 3), ('sendMessage', 1)]:
            with patch.object(setup.urllib.request, 'urlopen', side_effect=URLError('private URL')), patch.object(setup.time, 'sleep'), self.subTest(method=method):
                with self.assertRaises(RuntimeError): setup.telegram_call('synthetic', method, {})
                self.assertEqual(setup.urllib.request.urlopen.call_count, attempts)
