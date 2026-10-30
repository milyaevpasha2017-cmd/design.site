import hashlib
import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('vps_config', Path(__file__).resolve().parents[1] / 'vps/setup-config.py')
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class VPSConfigTest(unittest.TestCase):
    def test_hash_and_configuration_preserve_unicode_and_systemd_literal_dollars(self):
        password = "O'Neil 👩🏽‍🎨 שלום مرحبا"
        hashed = config.password_hash(password)
        _, rounds, salt, derived = hashed.split('$')
        self.assertEqual(hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds)).hex(), derived)
        self.assertNotEqual(hashed, config.password_hash(password))
        text = config.configuration(hashed, 'github_pat_' + 'synthetic_value_' * 3)
        self.assertIn('ADMIN_PASSWORD_HASH=' + hashed + '\n', text)
        self.assertNotIn(password, text)
        for invalid in ['github_pat_' + 'x' * 25 + '\nPORT=9000', 'plain-password', '', ' ghp_' + 'x' * 30]:
            self.assertFalse(config.valid_token(invalid))
            with self.assertRaises(ValueError):
                config.configuration(hashed, invalid)
        with self.assertRaises(ValueError):
            config.password_hash('short')

    def test_exclusive_private_write_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'etc' / 'server.env'
            config.write_once(path, 'first\n')
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
            with self.assertRaises(FileExistsError):
                config.write_once(path, 'replacement\n')
            self.assertEqual(path.read_text(), 'first\n')
            link = Path(directory) / 'linked'
            link.symlink_to(path.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                config.write_once(link / 'another.env', 'bad\n')


if __name__ == '__main__':
    unittest.main()
