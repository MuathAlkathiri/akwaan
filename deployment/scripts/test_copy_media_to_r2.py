import unittest
import subprocess
import os
import json
import tempfile
import http.server
import shutil
import threading

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



class _Fixture:
    """A pack and an uploads directory that exist only for one test.

    The tests above read the real source packs and the git-ignored
    `backend/uploads`, so they describe one machine. These build their own
    inputs and pass them with `--uploads-dir`, so they mean the same everywhere.
    """

    def __init__(self, files, text_only=0):
        self.root = tempfile.mkdtemp(prefix='akwaan-media-test-')
        self.uploads = os.path.join(self.root, 'uploads')
        questions = []
        for index, (name, body) in enumerate(files):
            path = os.path.join(self.uploads, 'question-assets', 'images', name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            if body is not None:
                with open(path, 'wb') as handle:
                    handle.write(body)
            questions.append({
                'id': f'q-img-{index}',
                'media': {'type': 'image', 'assets': [
                    {'url': f'/uploads/question-assets/images/{name}'}]},
            })
        for index in range(text_only):
            questions.append({'id': f'q-text-{index}', 'media': {'type': 'none'}})
        self.manifest = os.path.join(self.root, 'pack.source.json')
        with open(self.manifest, 'w', encoding='utf-8') as handle:
            json.dump({'questions': questions}, handle)

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


def _serve(directory):
    """Serve `directory` so that /uploads/<key> answers like the media path."""
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}'


PNG = b'\x89PNG\r\n\x1a\n' + b'akwaan-test-image'

# Stands in for the aws CLI: `s3 sync` copies into $FAKE_BUCKET, `s3api
# head-object` answers from it. $FAKE_CORRUPT truncates what was "uploaded".
FAKE_AWS = r"""#!/usr/bin/env python3
import json, os, shutil, sys
args = sys.argv[1:]
bucket = os.environ['FAKE_BUCKET']
if args[:2] == ['s3', 'sync']:
    shutil.copytree(args[2], bucket, dirs_exist_ok=True)
    if os.environ.get('FAKE_CORRUPT'):
        for base, _, names in os.walk(bucket):
            for name in names:
                with open(os.path.join(base, name), 'wb') as handle:
                    handle.write(b'x')
    sys.exit(0)
if args[:2] == ['s3api', 'head-object']:
    path = os.path.join(bucket, args[args.index('--key') + 1])
    if not os.path.isfile(path):
        sys.exit(254)
    print(json.dumps({'ContentLength': os.path.getsize(path)}))
    sys.exit(0)
sys.exit(2)
"""


class TestManifestModeHermetic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        here = os.path.dirname(os.path.abspath(__file__))
        cls.script = os.path.join(here, 'copy-media-to-r2.sh')
        cls.repo_root = os.path.abspath(os.path.join(here, '..', '..'))

    def run_script(self, args, env=None):
        merged = dict(os.environ)
        merged.update(env or {})
        return subprocess.run([self.script] + args, capture_output=True, text=True,
                              cwd=self.repo_root, env=merged)

    def fixture(self, *args, **kwargs):
        fixture = _Fixture(*args, **kwargs)
        self.addCleanup(fixture.cleanup)
        return fixture

    def test_uploads_dir_is_where_files_are_read_from(self):
        fx = self.fixture([('a.png', PNG), ('b.png', PNG)])
        res = self.run_script(['--manifest', fx.manifest, '--dry-run', '--uploads-dir', fx.uploads])
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn('Approved Media Assets Found: 2', res.stdout)
        self.assertIn(fx.uploads, res.stdout)

    def test_missing_file_names_the_directory_and_the_docker_volume(self):
        fx = self.fixture([('a.png', PNG), ('gone.png', None)])
        res = self.run_script(['--manifest', fx.manifest, '--dry-run', '--uploads-dir', fx.uploads])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('Missing local asset on disk', res.stderr)
        self.assertIn(f'files are read from {fx.uploads}', res.stderr)
        self.assertIn('backend_uploads volume', res.stderr)

    def test_text_only_items_are_reported_but_allowed_by_default(self):
        fx = self.fixture([('a.png', PNG)], text_only=2)
        res = self.run_script(['--manifest', fx.manifest, '--dry-run', '--uploads-dir', fx.uploads])
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn('NOTE: 2 of 3 active questions carry no media.', res.stderr)

    def test_require_media_refuses_a_text_only_item(self):
        fx = self.fixture([('a.png', PNG)], text_only=2)
        res = self.run_script(['--manifest', fx.manifest, '--dry-run', '--uploads-dir', fx.uploads,
                               '--require-media'])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('[q-text-0] carries no media (--require-media)', res.stderr)
        self.assertIn('[q-text-1] carries no media (--require-media)', res.stderr)

    def test_require_media_passes_when_every_item_has_media(self):
        fx = self.fixture([('a.png', PNG)])
        res = self.run_script(['--manifest', fx.manifest, '--dry-run', '--uploads-dir', fx.uploads,
                               '--require-media'])
        self.assertEqual(res.returncode, 0, res.stderr)

    def test_check_remote_separates_live_from_missing(self):
        # live.png: here and served. only-remote.png: served, absent locally.
        # nowhere.png: neither.
        fx = self.fixture([('live.png', PNG), ('only-remote.png', None), ('nowhere.png', None)])
        served = tempfile.mkdtemp(prefix='akwaan-served-')
        self.addCleanup(shutil.rmtree, served, True)
        target = os.path.join(served, 'uploads', 'question-assets', 'images')
        os.makedirs(target)
        for name in ('live.png', 'only-remote.png'):
            with open(os.path.join(target, name), 'wb') as handle:
                handle.write(PNG)
        server, base = _serve(served)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        res = self.run_script(['--manifest', fx.manifest, '--uploads-dir', fx.uploads,
                               '--check-remote', base])
        self.assertEqual(res.returncode, 1, res.stdout + res.stderr)   # nowhere.png is not OK
        lines = {line.split()[2]: line.split()[:2] for line in res.stdout.splitlines()
                 if 'question-assets/images/' in line}
        self.assertEqual(lines['question-assets/images/live.png'], ['yes', 'OK'])
        self.assertEqual(lines['question-assets/images/only-remote.png'], ['NO', 'OK'])
        self.assertEqual(lines['question-assets/images/nowhere.png'], ['NO', 'MISSING(404)'])
        self.assertIn('Assets: 3 | not OK: 1', res.stdout)

    def test_check_remote_flags_different_bytes(self):
        fx = self.fixture([('a.png', PNG)])
        served = tempfile.mkdtemp(prefix='akwaan-served-')
        self.addCleanup(shutil.rmtree, served, True)
        target = os.path.join(served, 'uploads', 'question-assets', 'images')
        os.makedirs(target)
        with open(os.path.join(target, 'a.png'), 'wb') as handle:
            handle.write(PNG + b'-an-older-version')
        server, base = _serve(served)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        res = self.run_script(['--manifest', fx.manifest, '--uploads-dir', fx.uploads,
                               '--check-remote', base])
        self.assertEqual(res.returncode, 1)
        self.assertIn('DIFFERENT', res.stdout)

    def test_check_remote_never_calls_aws(self):
        fx = self.fixture([('a.png', PNG)])
        bin_dir = tempfile.mkdtemp(prefix='akwaan-bin-')
        self.addCleanup(shutil.rmtree, bin_dir, True)
        marker = os.path.join(bin_dir, 'called')
        with open(os.path.join(bin_dir, 'aws'), 'w') as handle:
            handle.write(f'#!/bin/sh\ntouch {marker}\n')
        os.chmod(os.path.join(bin_dir, 'aws'), 0o755)
        server, base = _serve(fx.root)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.run_script(['--manifest', fx.manifest, '--uploads-dir', fx.uploads, '--check-remote', base],
                        env={'PATH': bin_dir + os.pathsep + os.environ['PATH']})
        self.assertFalse(os.path.exists(marker))

    def _live(self, fx, extra_args=(), extra_env=None):
        bin_dir = tempfile.mkdtemp(prefix='akwaan-bin-')
        bucket = tempfile.mkdtemp(prefix='akwaan-bucket-')
        self.addCleanup(shutil.rmtree, bin_dir, True)
        self.addCleanup(shutil.rmtree, bucket, True)
        with open(os.path.join(bin_dir, 'aws'), 'w') as handle:
            handle.write(FAKE_AWS)
        os.chmod(os.path.join(bin_dir, 'aws'), 0o755)
        env = {'PATH': bin_dir + os.pathsep + os.environ['PATH'], 'FAKE_BUCKET': bucket,
               'AWS_ACCESS_KEY_ID': 'test', 'AWS_SECRET_ACCESS_KEY': 'test',
               'R2_ACCOUNT_ID': 'test', 'R2_BUCKET': 'test-bucket'}
        env.update(extra_env or {})
        res = self.run_script(['--manifest', fx.manifest, '--uploads-dir', fx.uploads] + list(extra_args),
                              env=env)
        return res, bucket

    def test_live_upload_verifies_size_in_the_bucket(self):
        fx = self.fixture([('a.png', PNG), ('b.png', PNG + b'2')])
        res, bucket = self._live(fx)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('All 2 objects verified in r2://test-bucket (present, size matches)', res.stdout)
        self.assertTrue(os.path.isfile(os.path.join(bucket, 'question-assets', 'images', 'b.png')))

    def test_live_upload_fails_when_the_bucket_holds_other_bytes(self):
        fx = self.fixture([('a.png', PNG)])
        res, _ = self._live(fx, extra_env={'FAKE_CORRUPT': '1'})
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('bucket size 1 != local', res.stderr)

    def test_verify_public_compares_bytes_through_the_media_path(self):
        fx = self.fixture([('a.png', PNG)])
        server, base = _serve(fx.root)          # serves the very files that were "uploaded"
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        res, _ = self._live(fx, extra_args=['--verify-public', base])
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('Assets: 1 | not OK: 0', res.stdout)

    def test_verify_public_fails_when_the_media_path_does_not_serve_it(self):
        fx = self.fixture([('a.png', PNG)])
        empty = tempfile.mkdtemp(prefix='akwaan-empty-')
        self.addCleanup(shutil.rmtree, empty, True)
        server, base = _serve(empty)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        res, _ = self._live(fx, extra_args=['--verify-public', base])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('MISSING(404)', res.stdout)


if __name__ == '__main__':
    unittest.main()
