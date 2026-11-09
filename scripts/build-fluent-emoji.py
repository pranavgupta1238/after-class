"""Build local Fluent 3D/WebP artwork from pinned, separately downloaded sources.
Usage: python3 scripts/build-fluent-emoji.py <static-source> [animated-source] [--reuse-stills]
Requires Pillow with WebP support. No network access; originals remain untouched.
"""
import concurrent.futures, json, pathlib, shutil, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
STATIC_SHA = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'
ANIMATED_SHA = 'daa0365c09795789ed2bc6e8b228c97736cb6669'
source = pathlib.Path(sys.argv[1])
animated = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None
output = ROOT / 'public/emoji/fluent-3d-v1'
output.mkdir(parents=True, exist_ok=True)
normalize = lambda s: s.replace('\ufe0f', '')
catalog = {normalize(row[0]): row for row in json.loads((ROOT/'src/data/emoji-catalog.json').read_text())}
tones = ['Default', 'Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark']
jobs = []
for metadata in sorted((source/'assets').glob('*/metadata.json')):
    data = json.loads(metadata.read_text())
    variants = data.get('unicodeSkintones') or [data['unicode']]
    for index, sequence in enumerate(variants):
        glyph = ''.join(chr(int(point, 16)) for point in sequence.split())
        row = catalog.get(normalize(glyph))
        if not row:
            continue
        folder = metadata.parent / tones[index] if len(variants) > 1 else metadata.parent
        files = list((folder/'3D').glob('*.png'))
        if len(files) != 1:
            raise ValueError(f'Unexpected artwork: {folder}')
        animation_path = str(files[0].relative_to(source)).replace('/3D/', '/animated/').replace('_3d', '_animated')
        jobs.append((row, files[0], animation_path))

def build(job):
    row, path, animation_path = job
    key = row[3]
    if '--reuse-stills' not in sys.argv or not (output/f'{key}.webp').exists():
        image = Image.open(path).convert('RGBA')
        image.thumbnail((160,160), Image.Resampling.LANCZOS)
        image.save(output/f'{key}.webp', 'WEBP', quality=92, method=6)
    entry = {'source': str(path.relative_to(source))}
    motion = animated / animation_path if animated else None
    if motion and motion.exists():
        original = Image.open(motion)
        frames, durations = [], []
        # Keep the authored timing, sample at <=24fps and downsize for chat.
        pending = 0
        for index in range(original.n_frames):
            original.seek(index)
            pending += original.info.get('duration', 42)
            if pending >= 40 or index == original.n_frames-1:
                frame = original.convert('RGBA')
                frame.thumbnail((128,128), Image.Resampling.LANCZOS)
                frames.append(frame); durations.append(round(pending)); pending=0
        if len(frames)>1:
            frames[0].save(output/f'{key}-motion.webp','WEBP',save_all=True,append_images=frames[1:],duration=durations,loop=1,quality=85,method=4,minimize_size=True)
            entry['duration'] = sum(durations)
            entry['animationSource'] = animation_path
    return key, entry

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    manifest = dict(pool.map(build, jobs))
# Runtime manifest stays compact. Full provenance is retained separately.
(ROOT/'src/data/emoji-artwork.json').write_text(json.dumps({key: entry.get('duration',0) for key,entry in sorted(manifest.items())},separators=(',',':'))+'\n')
(output/'sources.json').write_text(json.dumps({'staticCommit':STATIC_SHA,'animatedCommit':ANIMATED_SHA,'assets':manifest},indent=2)+'\n')
shutil.copyfile(source/'LICENSE',ROOT/'public/emoji/LICENSE-FLUENT.txt')
print(f'{len(manifest)} 3D emoji; {sum(bool(e.get("duration")) for e in manifest.values())} authored animations; {sum(p.stat().st_size for p in output.glob("*.webp") if not p.name.startswith("._"))/1e6:.1f} MB')
