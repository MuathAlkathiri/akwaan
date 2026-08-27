import unittest
import subprocess
import os
import json
import tempfile

class TestCopyMediaToR2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        here = os.path.dirname(os.path.abspath(__file__))
        cls.script = os.path.join(here, 'copy-media-to-r2.sh')
        cls.repo_root = os.path.abspath(os.path.join(here, '..', '..'))

    def run_script(self, args):
        cmd = [self.script] + args
        res = subprocess.run(cmd, capture_output=True, text=True, cwd=self.repo_root)
        return res

    def test_marhala_batch_01_dry_run_exact_31(self):
        manifest = 'ai/scripts/data/marhala-video-games-batch-01.source.json'
        res = self.run_script(['--manifest', manifest, '--dry-run'])
        self.assertEqual(res.returncode, 0, f'Script failed: {res.stderr}')
        self.assertIn('Approved Media Assets Found: 31', res.stdout)
        self.assertIn('DRY-RUN SUCCESS (Zero R2 writes performed)', res.stdout)
        self.assertIn('question-assets/images/vg_fifa_cr7_card.webp', res.stdout)
        self.assertIn('question-assets/images/vg_fifa_beckham_card.webp', res.stdout)
        self.assertIn('question-assets/images/vg_fifa_gullit_card.webp', res.stdout)
        self.assertNotIn('vg_mc_creeper_fuse.mp3', res.stdout)
        self.assertNotIn('vg_ow_mercy_wings.webp', res.stdout)

    def test_missing_manifest_file_aborts(self):
        res = self.run_script(['--manifest', 'non_existent_file.json', '--dry-run'])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('Manifest file not found', res.stderr)

    def test_malformed_json_aborts(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            f.write('{ invalid json')
            bad_path = f.name
        try:
            res = self.run_script(['--manifest', bad_path, '--dry-run'])
            self.assertNotEqual(res.returncode, 0)
            self.assertIn('Failed to parse JSON manifest', res.stderr)
        finally:
            os.remove(bad_path)

    def test_zero_assets_aborts(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'questions': [{'id': 'q1', 'media': {'type': 'none'}}]}, f)
            path = f.name
        try:
            res = self.run_script(['--manifest', path, '--dry-run'])
            self.assertNotEqual(res.returncode, 0)
            self.assertIn('zero media assets to ingest', res.stderr)
        finally:
            os.remove(path)

    def test_outside_canonical_path_aborts(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'questions': [{'id': 'q1', 'media': {'type': 'image', 'assets': [{'url': '/etc/passwd'}]}}]}, f)
            path = f.name
        try:
            res = self.run_script(['--manifest', path, '--dry-run'])
            self.assertNotEqual(res.returncode, 0)
            self.assertIn('outside canonical question-assets path', res.stderr)
        finally:
            os.remove(path)

    def test_missing_local_asset_aborts(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'questions': [{'id': 'q1', 'media': {'type': 'image', 'assets': [{'url': '/uploads/question-assets/images/non_existent_image_12345.webp'}]}}]}, f)
            path = f.name
        try:
            res = self.run_script(['--manifest', path, '--dry-run'])
            self.assertNotEqual(res.returncode, 0)
            self.assertIn('Missing local asset on disk', res.stderr)
        finally:
            os.remove(path)

if __name__ == '__main__':
    unittest.main()
