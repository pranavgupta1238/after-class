"""Build the pinned Unicode 17 catalog from emoji-test.txt and Twemoji 17.0.3.
Usage: python3 scripts/build-emoji-catalog.py <emoji-test.txt> <twemoji-17.0.3>
Downloads are explicit; this script performs no network access.
"""
import json, pathlib, re, shutil, sys
root = pathlib.Path(__file__).resolve().parents[1]
unicode_file, artwork = map(pathlib.Path, sys.argv[1:])
text = unicode_file.read_text()
assert '# Version: 17.0' in text
assert json.loads((artwork / 'package.json').read_text())['version'] == '17.0.3'
groups = {'Smileys & Emotion':'smileys','People & Body':'people','Animals & Nature':'nature','Food & Drink':'food','Travel & Places':'travel','Activities':'activities','Objects':'objects','Symbols':'symbols','Flags':'flags','Component':'components'}
rows, missing = [], []
out = root / 'public/emoji/twemoji-17.0.3'
out.mkdir(parents=True, exist_ok=True)
for line in text.splitlines():
    if line.startswith('# group: '): group = groups[line[9:]]
    match = re.match(r'^([A-F0-9 ]+)\s*;\s*(fully-qualified|component)\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$',line)
    if not match: continue
    codes, _, value, name = match.groups()
    points = [f'{int(c,16):x}' for c in codes.split()]
    candidates = ['-'.join(points), '-'.join(c for c in points if c != 'fe0f')]
    asset = next((c for c in candidates if (artwork/'assets/svg'/f'{c}.svg').exists()), None)
    if not asset: missing.append((value,name)); continue
    source = artwork/'assets/svg'/f'{asset}.svg'
    # Vendored SVGs must contain no executable or external content.
    svg = source.read_text()
    assert not re.search(r'<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=', svg, re.I), asset
    shutil.copyfile(source, out/f'{asset}.svg')
    rows.append([value,name,group,asset])
assert not missing, missing
(root/'src/data/emoji-catalog.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
shutil.copyfile(artwork/'LICENSE-GRAPHICS', root/'public/emoji/LICENSE-TWEMOJI.txt')
print(f'{len(rows)} emoji entries; {len({row[3] for row in rows})} local SVG assets')
