import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_vps', ROOT / 'scripts/package-vps.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTest(unittest.TestCase):
    def test_notification_setup_is_shipped_without_configuration_secrets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / '_site-vps').mkdir()
            (root / 'vps').mkdir()
            expected = ['setup-telegram-relay.py', 'setup-telegram.py',
                        'notification_config.py', 'telegram.mjs', 'server.mjs']
            for name in expected + ['server.env', 'private-key', 'unexpected.py']:
                (root / 'vps' / name).write_text('fixture')
            archive = root / 'release.tar.gz'
            with patch.object(package, 'ROOT', root), patch.object(package.sys, 'argv', ['package-vps.py', str(archive)]), patch.object(package.subprocess, 'check_output', return_value='a' * 40):
                package.main()
            with tarfile.open(archive) as bundle:
                names = set(bundle.getnames())
            for name in expected:
                self.assertIn('vps/' + name, names)
            for name in ['server.env', 'private-key', 'unexpected.py']:
                self.assertNotIn('vps/' + name, names)
