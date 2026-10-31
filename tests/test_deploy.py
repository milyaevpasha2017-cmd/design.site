import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).resolve().parents[1] / 'vps/deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def bundle(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, data, kind in entries:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            entry.size = len(data) if kind == tarfile.REGTYPE else 0
            entry.linkname = '/etc/passwd' if kind == tarfile.SYMTYPE else ''
            archive.addfile(entry, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
    output.seek(0)
    return output


class DeploymentTest(unittest.TestCase):
    def test_reject_traversal_symlinks_unexpected_and_duplicates(self):
        for entries in [
            [('../escape', b'x', tarfile.REGTYPE)],
            [('/etc/passwd', b'x', tarfile.REGTYPE)],
            [('vps/link', b'', tarfile.SYMTYPE)],
            [('.env', b'secret', tarfile.REGTYPE)],
            [('vps/file', b'x', tarfile.REGTYPE)] * 2,
        ]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    deploy.unpack(bundle(entries), Path(directory))

    def test_complete_artifact_and_schema_gate(self):
        names = ('vps/server.mjs', 'vps/backup.mjs', 'vps/sql/001-up.sql',
                 'site-worker/generated/site.json', 'password-admin/schema.json',
                 '_site-vps/index.html', '_site-vps/admin/login/index.html')
        for schema in [1, 2]:
            data = {'commit': 'a' * 40, 'schema': schema}
            entries = [(name, b'content', tarfile.REGTYPE) for name in names]
            entries.append(('release.json', json.dumps(data).encode(), tarfile.REGTYPE))
            with tempfile.TemporaryDirectory() as directory:
                if schema == 1:
                    self.assertEqual(deploy.unpack(bundle(entries), Path(directory)), data)
                else:
                    with self.assertRaises(ValueError):
                        deploy.unpack(bundle(entries), Path(directory))

    def test_failed_activation_restores_previous_release(self):
        # Exercise main's rollback with real directories/symlinks, mocked service/HTTP/backup.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'releases/old').mkdir(parents=True)
            previous = root / 'releases/old'
            (root / 'current').symlink_to(previous)
            archive = bundle([('release.json', b'{}', tarfile.REGTYPE)])
            def unpack(_archive, release):
                return {'commit': 'a' * 40, 'schema': 1}
            def run(*args):
                if 'runuser' in args[0]:
                    Path(args[-1]).touch()
            # Patch filesystem-only global paths rather than touch production locations.
            original_read_text = Path.read_text
            def read_text(path, *a, **kw):
                if str(path) == '/etc/epiphany/server.env': return ''
                return original_read_text(path, *a, **kw)
            original_mkdir = Path.mkdir
            def mkdir(path, *a, **kw):
                if str(path) == '/var/backups/epiphany': return
                return original_mkdir(path, *a, **kw)
            original_replace = deploy.os.replace
            def replace(source, destination):
                if str(destination).startswith('/var/backups/epiphany/'):
                    Path(source).unlink()
                else: original_replace(source, destination)
            with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'DATABASE', root/'state.sqlite'), \
                 patch.object(deploy.sys, 'argv', ['deploy']), patch.object(deploy.sys, 'stdin') as stdin, \
                 patch.object(deploy, 'unpack', side_effect=unpack), patch.object(deploy, 'run', side_effect=run), \
                 patch.object(deploy, 'healthy', side_effect=RuntimeError('unhealthy')), \
                 patch.object(deploy.time, 'sleep'), patch.object(deploy.grp, 'getgrnam') as group, \
                 patch.object(Path, 'read_text', read_text), patch.object(Path, 'mkdir', mkdir), \
                 patch.object(deploy.os, 'replace', side_effect=replace), patch.object(deploy.os, 'chown'), \
                 patch.object(deploy.os, 'geteuid', return_value=0):
                group.return_value.gr_gid = 0
                stdin.buffer = archive
                with self.assertRaises(RuntimeError): deploy.main()
            self.assertEqual((root/'current').resolve(), previous)
            self.assertEqual(list((root/'releases').iterdir()), [previous])
