#!/usr/bin/env python3
"""Fast, offline repository checks; no application dependencies required."""
import argparse
import ast
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.scripts, self.ids = [], [], set()
        self.viewport = False
        self.inline = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            if attrs['id'] in self.ids:
                raise ValueError(f"duplicate id: {attrs['id']}")
            self.ids.add(attrs['id'])
        if tag == 'meta' and attrs.get('name') == 'viewport':
            self.viewport = True
        key = 'href' if tag == 'link' else 'src'
        if tag in ('link', 'script', 'img') and attrs.get(key):
            self.refs.append(attrs[key])
        if tag == 'script' and not attrs.get('src') and attrs.get('type', '') in ('', 'text/javascript', 'module'):
            self.inline = []

    def handle_data(self, data):
        if self.inline is not None:
            self.inline.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.inline is not None:
            self.scripts.append(''.join(self.inline))
            self.inline = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full-data', action='store_true', help='also parse large intermediate JSON')
    args = parser.parse_args()
    errors, js_sources = [], []
    for path in sorted(ROOT.rglob('*.html')):
        if any(p in ('work', 'node_modules', '.git') for p in path.relative_to(ROOT).parts):
            continue
        try:
            page = Page()
            page.feed(path.read_text(encoding='utf-8'))
            if not page.viewport:
                raise ValueError('missing viewport metadata')
            for ref in page.refs:
                url = urlsplit(ref)
                if url.scheme or url.netloc or not url.path:
                    continue
                target = (ROOT / unquote(url.path).lstrip('/')) if url.path.startswith('/') else path.parent / unquote(url.path)
                if not target.exists():
                    errors.append(f'{path.relative_to(ROOT)}: missing asset {ref}')
            js_sources.extend((f'{path.relative_to(ROOT)} inline script {i + 1}', code) for i, code in enumerate(page.scripts))
        except (ValueError, OSError) as exc:
            errors.append(f'{path.relative_to(ROOT)}: {exc}')
    for path in (ROOT / 'static/js').glob('*.js'):
        js_sources.append((str(path.relative_to(ROOT)), path.read_text()))
    if not shutil.which('node'):
        errors.append('Node.js is required for JavaScript syntax checks')
    else:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'check.js'
            for label, code in js_sources:
                source.write_text(code, encoding='utf-8')
                result = subprocess.run(['node', '--check', str(source)], capture_output=True, text=True)
                if result.returncode:
                    errors.append(f'{label}: {result.stderr.strip()}')
    for path in list((ROOT / 'scripts').rglob('*.py')) + list((ROOT / 'tools').glob('*.py')):
        try:
            ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        except (SyntaxError, OSError) as exc:
            errors.append(f'{path.relative_to(ROOT)}: {exc}')
    data_paths = list((ROOT / 'static/data').glob('*.json'))
    if args.full_data:
        data_paths += list((ROOT / 'scripts').glob('*.json'))
    for path in data_paths:
        try:
            data = json.loads(path.read_text(encoding='utf-8'), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f'non-finite value {value}')))
            if path.name == 'stock_universe.json':
                if not isinstance(data, list) or not data:
                    raise ValueError('expected a nonempty stock list')
                symbols = [row.get('Symbol') for row in data if isinstance(row, dict)]
                if len(symbols) != len(data) or any(not isinstance(s, str) or not s for s in symbols) or len(set(symbols)) != len(symbols):
                    raise ValueError('invalid or duplicate stock symbols')
            if path.name == 'data_version.json' and (not isinstance(data, dict) or not isinstance(data.get('timestamp'), (int, float)) or isinstance(data.get('timestamp'), bool) or data['timestamp'] <= 0):
                raise ValueError('expected positive numeric timestamp')
        except (ValueError, OSError) as exc:
            errors.append(f'{path.relative_to(ROOT)}: {exc}')
    if errors:
        print('\n'.join(errors))
        return 1
    print(f'PASS: HTML assets/viewports, {len(js_sources)} JS scripts, Python syntax, {len(data_paths)} JSON files')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
