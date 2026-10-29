import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('secret_audit',ROOT/'scripts/audit-secrets.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class SecretAuditTests(unittest.TestCase):
    def test_known_formats_are_detected_without_echoing_the_value(self):
        synthetic=('gh'+'p_'+'A'*36).encode()
        records=module.findings(b'line one\n'+synthetic,dict(path='synthetic.txt'))
        self.assertEqual(records,[dict(path='synthetic.txt',rule='github-token',line=2)])
        self.assertNotIn(synthetic.decode(),str(records))
        self.assertEqual(module.findings(b'\0binary-metadata:'+synthetic,dict(path='synthetic.bin'))[0]['rule'],'github-token')
        key=('-----BEGIN '+'PRIVATE KEY-----').encode()
        self.assertEqual(module.findings(key,dict(path='synthetic'))[0]['rule'],'private-key')

    def test_server_env_references_and_public_client_id_are_not_secrets(self):
        source=b'client_secret: env.GITHUB_CLIENT_SECRET, GITHUB_CLIENT_ID: "public-client-id"'
        self.assertEqual(module.findings(source,dict(path='synthetic')),[])
