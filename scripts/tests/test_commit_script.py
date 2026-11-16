"""Exercise the publisher against temporary, offline Git repositories."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / 'commit_data.sh'


@unittest.skipUnless(shutil.which('git') and shutil.which('bash'), 'requires git and bash')
class CommitDataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.remote = self.root / 'origin.git'
        self.repo = self.root / 'working'
        self.environment = {**os.environ, 'DATA_BRANCH': 'main',
                            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull}
        self.git(self.root, 'init', '--bare', str(self.remote))
        self.git(self.root, 'clone', str(self.remote), str(self.repo))
        self.git(self.repo, 'checkout', '-b', 'main')
        self.git(self.repo, 'config', 'user.name', 'Test')
        self.git(self.repo, 'config', 'user.email', 'test@example.invalid')
        (self.repo / 'data.json').write_text('[1]\n')
        (self.repo / 'other.txt').write_text('old\n')
        self.git(self.repo, 'add', '.')
        self.git(self.repo, 'commit', '-m', 'initial')
        self.git(self.repo, 'push', '-u', 'origin', 'main')

    def git(self, cwd, *args):
        return subprocess.run(['git', *args], cwd=cwd, env=self.environment,
                              text=True, capture_output=True, check=True).stdout.strip()

    def publish(self):
        return subprocess.run(['bash', str(HELPER), 'data.json'], cwd=self.repo,
                              env=self.environment, text=True, capture_output=True)

    def test_unchanged_snapshot_does_not_create_commit(self):
        before = self.git(self.repo, 'rev-parse', 'HEAD')
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), before)

    def test_refuses_unrelated_staged_changes(self):
        (self.repo / 'other.txt').write_text('staged work\n')
        self.git(self.repo, 'add', 'other.txt')
        (self.repo / 'data.json').write_text('[2]\n')
        result = self.publish()
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(self.git(self.repo, 'diff', '--cached', '--name-only'), 'other.txt')

    def test_rebases_on_concurrent_change_to_another_file(self):
        other = self.root / 'concurrent'
        self.git(self.root, 'clone', '-b', 'main', str(self.remote), str(other))
        self.git(other, 'config', 'user.name', 'Other collector')
        self.git(other, 'config', 'user.email', 'other@example.invalid')
        (other / 'other.txt').write_text('updated by another collector\n')
        self.git(other, 'add', 'other.txt')
        self.git(other, 'commit', '-m', 'parallel update')
        self.git(other, 'push', 'origin', 'main')
        (self.repo / 'data.json').write_text('[2]\n')
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.repo / 'other.txt').read_text(), 'updated by another collector\n')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'),
                         self.git(self.remote, 'rev-parse', 'main'))
        self.assertEqual(self.git(self.repo, 'show', '--pretty=format:', '--name-only', 'HEAD'), 'data.json')


if __name__ == '__main__':
    unittest.main()
