import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vps'))
spec = importlib.util.spec_from_file_location('telegram_setup', Path(__file__).resolve().parents[1] / 'vps/setup-telegram.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class TelegramSetupTest(unittest.TestCase):
    def test_api_error_is_actionable_without_exposing_token_or_url(self):
        token = '123456:synthetic_token_that_must_not_be_printed'
        url = 'https://api.telegram.org/bot' + token + '/getUpdates'
        with patch.object(setup, 'telegram_request', return_value=(409, {'description': 'Conflict: webhook active ' + url + ' ' + token})):
            with self.assertRaises(RuntimeError) as context: setup.telegram_call(token, 'getUpdates', {})
        message = str(context.exception)
        self.assertIn('getUpdates: HTTP 409', message)
        self.assertNotIn(token, message)
        self.assertNotIn('https://', message)

    def test_transport_retries_reads_but_not_send_message(self):
        for method, attempts in [('getUpdates', 3), ('sendMessage', 1)]:
            with patch.object(setup, 'telegram_request', side_effect=RuntimeError('connection failed')), patch.object(setup.time, 'sleep'), self.subTest(method=method):
                with self.assertRaises(RuntimeError): setup.telegram_call('synthetic', method, {})
                self.assertEqual(setup.telegram_request.call_count, attempts)

    def test_transport_keeps_token_off_argv_and_handles_json_escaping(self):
        import telegram_transport as transport
        token='12345:synthetic_secret'
        url='https://api.telegram.org/bot'+token+'/sendMessage'
        payload={'text': 'Клиент "quoted"\nnext line \\ slash'}
        fake=SimpleNamespace(returncode=0,stdout='{"ok":true,"result":{}}\n200',stderr='')
        with patch.object(transport.subprocess,'run',return_value=fake) as runner:
            self.assertEqual(transport.telegram_request(url,payload)[0],200)
        args=runner.call_args.args[0]
        self.assertNotIn(token,' '.join(args));self.assertIn('-4',args);self.assertNotIn('--insecure',args)
        lines=runner.call_args.kwargs['input'].splitlines()
        self.assertEqual(json.loads(lines[0].split(' = ',1)[1]),url)
        self.assertEqual(json.loads(json.loads(lines[3].split(' = ',1)[1])),payload)
        with patch.object(transport.subprocess,'run',return_value=SimpleNamespace(returncode=28,stdout='',stderr=url)):
            with self.assertRaises(RuntimeError) as failure:transport.telegram_request(url,payload)
        self.assertNotIn(token,str(failure.exception));self.assertIn('28',str(failure.exception))
