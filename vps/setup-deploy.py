#!/usr/bin/env python3
"""One-time administrator setup for a dedicated, restricted CI deployment key."""
import argparse
import os
from pathlib import Path
import pwd
import shutil
import subprocess


def run(*args):
    subprocess.run(args, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--installer', required=True, type=Path)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    if not Path('/opt/epiphany/current').is_symlink():
        raise RuntimeError('Existing release not found')
    run('python3', '-m', 'py_compile', str(args.installer))
    os.umask(0o077)
    try:
        account = pwd.getpwnam('epiphany-deploy')
    except KeyError:
        run('useradd', '--create-home', '--shell', '/bin/sh', 'epiphany-deploy')
        account = pwd.getpwnam('epiphany-deploy')
    # A valid shell is needed by sshd, while the account password stays locked.
    run('usermod', '--lock', 'epiphany-deploy')
    destination = Path('/usr/local/sbin/epiphany-deploy')
    shutil.copyfile(args.installer, destination)
    destination.chmod(0o755)
    os.chown(destination, 0, 0)
    sudoers = Path('/etc/sudoers.d/epiphany-deploy')
    candidate = Path('/etc/sudoers.d/.epiphany-deploy-check')
    candidate.write_text('epiphany-deploy ALL=(root) NOPASSWD: /usr/local/sbin/epiphany-deploy ""\n')
    candidate.chmod(0o440)
    run('visudo', '-cf', str(candidate))
    candidate.replace(sudoers)
    key = Path('/root/.ssh/epiphany-actions')
    key.parent.mkdir(mode=0o700, exist_ok=True)
    if not key.exists():
        run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'epiphany-github-actions', '-f', str(key))
    public = key.with_suffix('.pub').read_text().strip()
    if not public.startswith('ssh-ed25519 ') or '\n' in public:
        raise RuntimeError('Invalid public key')
    ssh = Path(account.pw_dir) / '.ssh'
    ssh.mkdir(mode=0o700, exist_ok=True)
    # Root owns the key restriction: deployment cannot grant itself a shell.
    os.chown(ssh, 0, 0)
    ssh.chmod(0o755)
    authorized = ssh / 'authorized_keys'
    authorized.write_text('restrict,command="sudo -n /usr/local/sbin/epiphany-deploy" ' + public + '\n')
    os.chown(authorized, 0, 0)
    authorized.chmod(0o644)
    print('Deployment account ready. Private key was NOT printed.')
    print('Private key for GitHub secret: /root/.ssh/epiphany-actions')
    print('Verified server host key (copy this whole line to TIMEWEB_KNOWN_HOSTS):')
    fields = Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text().split()
    print('83.217.202.208 ' + ' '.join(fields[:2]))


if __name__ == '__main__':
    main()
