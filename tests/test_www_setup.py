import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('www_setup', Path(__file__).resolve().parents[1] / 'vps/setup-www.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class WWWSetupTest(unittest.TestCase):
    def environment(self, root):
        return patch.multiple(setup, CONFIG=root / 'nginx/epiphany-www.conf',
                              CERT=root / 'certs/epiphany-int-www',
                              WEBROOT=root / 'webroot', HOOK=root / 'hooks/epiphany-www-nginx')

    def dump(self):
        return ('# configuration file /etc/nginx/nginx.conf:\n'
                'http { include /etc/nginx/conf.d/*.conf; }\n'
                '# configuration file /etc/nginx/sites-enabled/epiphany:\n'
                'server { server_name epiphany-int.ru; }\n')

    def request(self, host, path, tls=False):
        if path == '/healthz':
            return 200, None, b'ok\n'
        if '/acme-challenge/' in path:
            return 200, None, b'epiphany-domain-check\n'
        return 301, 'https://' + setup.DOMAIN + path, b''

    def test_configuration_preserves_queries_and_keeps_http_challenge(self):
        text = setup.configuration(True)
        self.assertEqual(text.count('return 301 https://epiphany-int.ru$request_uri;'), 2)
        self.assertIn('location ^~ /.well-known/acme-challenge/', text)
        self.assertIn('server_name www.epiphany-int.ru;', text)
        self.assertNotIn('proxy_pass', text)
        self.assertNotIn('fullchain.pem', setup.configuration(False))

    def test_preflight_rejects_wrong_dns_and_other_www_vhost(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            with patch.object(setup.socket, 'getaddrinfo', return_value=[(0, 0, 0, '', ('203.0.113.1', 443))]):
                with self.assertRaisesRegex(RuntimeError, 'DNS'):
                    setup.preflight(self.dump())
            for names in ['www.epiphany-int.ru', '\n "www.epiphany-int.ru"']:
                with self.assertRaisesRegex(RuntimeError, 'другом файле'):
                    setup.preflight(self.dump() + 'server { server_name ' + names + '; }')
            with self.assertRaisesRegex(RuntimeError, 'не подключает'):
                setup.preflight('# configuration file /etc/nginx/nginx.conf:\nhttp {}')

    def test_preflight_accepts_only_owned_config_and_matching_dns(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            setup.atomic_write(setup.CONFIG, setup.configuration(True).encode())
            dump = self.dump() + '# configuration file ' + str(setup.CONFIG) + ':\n' + setup.CONFIG.read_text()
            with patch.object(setup.socket, 'getaddrinfo', return_value=[(0, 0, 0, '', (setup.ADDRESS, 443))]):
                setup.preflight(dump)
            setup.CONFIG.write_text('unrelated config')
            with self.assertRaisesRegex(RuntimeError, 'занят'):
                setup.preflight(dump)

    def run_configure(self, previous=None, failure=None):
        if previous is not None:
            setup.atomic_write(setup.CONFIG, previous)
        setup.CERT.mkdir(parents=True)
        for name in ['fullchain.pem', 'privkey.pem']:
            (setup.CERT / name).write_text('synthetic certificate')
        def command(*args, **kwargs):
            if args[0] == 'certbot' and failure:
                raise RuntimeError(failure)
            if '-checkhost' in args:
                return 'Hostname ' + setup.ALIAS + ' does match certificate\n'
            return self.dump() if '-T' in args else ''
        with patch.object(setup, 'preflight'), patch.object(setup, 'command', side_effect=command) as runner, \
                patch.object(setup, 'local_request', side_effect=self.request):
            if failure:
                with self.assertRaisesRegex(RuntimeError, failure):
                    setup.configure('nginx', 'certbot', 'openssl')
            else:
                setup.configure('nginx', 'certbot', 'openssl')
            return runner.call_args_list

    def test_success_installs_https_and_renewal_hook_without_touching_main_vhost(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            calls = self.run_configure()
            self.assertEqual(setup.CONFIG.read_text(), setup.configuration(True))
            self.assertEqual(setup.HOOK.stat().st_mode & 0o777, 0o755)
            self.assertIn('nginx -t\nsystemctl reload nginx', setup.HOOK.read_text())
            issuance = next(call for call in calls if call.args[0] == 'certbot')
            self.assertIn('epiphany-int-www', issuance.args)
            self.assertNotIn(setup.DOMAIN, issuance.args)
            self.assertIn('-checkhost', ' '.join(str(call.args) for call in calls))
            self.assertEqual(list((setup.WEBROOT / '.well-known/acme-challenge').iterdir()), [])

    def test_failed_issuance_restores_previous_config_and_hook(self):
        for previous in [None, (setup.MARKER + 'original contents\n').encode()]:
            with self.subTest(previous=previous), tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
                self.run_configure(previous, 'certificate failed')
                self.assertEqual(setup.CONFIG.read_bytes() if setup.CONFIG.exists() else None, previous)
                self.assertFalse(setup.HOOK.exists())

    def test_repeat_run_keeps_https_during_certificate_check(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            previous = setup.configuration(True).encode()
            self.run_configure(previous)
            self.assertEqual(setup.CONFIG.read_bytes(), previous)
            self.assertEqual(len(list(setup.CONFIG.parent.glob('*.backup-*'))), 1)

    def test_https_validation_failure_rolls_back_config_and_new_hook(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            def request(host, path, tls=False):
                if host == setup.ALIAS and tls:
                    return 200, None, b'wrong vhost'
                return self.request(host, path, tls)
            setup.CERT.mkdir(parents=True)
            for name in ['fullchain.pem', 'privkey.pem']:
                (setup.CERT / name).write_text('synthetic')
            with patch.object(setup, 'preflight'), patch.object(setup, 'command', return_value='Hostname ' + setup.ALIAS + ' does match certificate\n'), \
                    patch.object(setup, 'local_request', side_effect=request), patch.object(setup.time, 'sleep'):
                with self.assertRaisesRegex(RuntimeError, 'перенаправления'):
                    setup.configure('nginx', 'certbot', 'openssl')
            self.assertFalse(setup.CONFIG.exists())
            self.assertFalse(setup.HOOK.exists())

    def test_mismatched_certificate_is_rejected_even_with_successful_openssl_exit(self):
        with tempfile.TemporaryDirectory() as temporary, self.environment(Path(temporary)):
            setup.CERT.mkdir(parents=True)
            for name in ['fullchain.pem', 'privkey.pem']:
                (setup.CERT / name).write_text('synthetic')
            with patch.object(setup, 'preflight'), \
                    patch.object(setup, 'command', return_value='Hostname ' + setup.ALIAS + ' does NOT match certificate\n'), \
                    patch.object(setup, 'local_request', side_effect=self.request):
                with self.assertRaisesRegex(RuntimeError, 'не подтверждает'):
                    setup.configure('nginx', 'certbot', 'openssl')
            self.assertFalse(setup.CONFIG.exists())
            self.assertFalse(setup.HOOK.exists())


if __name__ == '__main__':
    unittest.main()
