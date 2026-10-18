"""Build the landing scroll film: normalise clips, Ken Burns the stills, crossfade, export frames + manifest.
Usage: build_film.py FFMPEG SRC_DIR PUBLIC_SCROLL_DIR WORK_DIR [desktop_q mobile_q]
"""
import json
import subprocess
import sys
from pathlib import Path

FF, SRC, OUT, WORK = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
DQ, MQ = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (70, 65)
W, H, FPS, XF, KB = 1920, 1080, 24, 0.6, 5.0
TARGET_FRAMES = 180
WORK.mkdir(parents=True, exist_ok=True)


def ff(*args):
    subprocess.run([FF, '-hide_banner', '-v', 'error', '-y', *args], check=True)


ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-an']

# 1) clips: delogo the Gemini sparkle (same spot in both, 1280x720 source), cover-scale + centre-crop, 24fps, no audio, 10s
# Sparkle already removed by unsparkle_video.py (reverse blend; clip3 also edge-inpainted) → WORK/{name}-clean.mp4
for name in ('clip1', 'clip3'):
    ff('-i', str(WORK / f'{name}-clean.mp4'), '-t', '10',
       '-vf', f'scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},fps={FPS},setsar=1',
       *ENC, str(WORK / f'{name}.mp4'))

# 2) Ken Burns stills. Image is cover-scaled to 1920x1080 then upscaled 4x so zoompan's integer x/y steps are
#    1/4 px in the output (no jitter). e = smoothstep easing over the 5 s.
N = int(KB * FPS)
E = f"(on/{N - 1})*(on/{N - 1})*(3-2*(on/{N - 1}))"
MOVES = {
    # (zoom expr, x expr, y expr) — x/y in input pixels; focus (fx, fy) keeps that point fixed while zooming
    'scene2': (f'1+0.12*{E}', 'iw*0.55-(iw/zoom)*0.55', 'ih*0.42-(ih/zoom)*0.42'),          # push-in, cards (centre-right)
    'scene4': (f'1+0.12*{E}', 'iw*0.54-(iw/zoom)*0.54', 'ih*0.46-(ih/zoom)*0.46'),          # push-in on the envelope
    'scene5': (f'1+0.11*{E}', '(iw-iw/zoom)*0.5', f'(ih-ih/zoom)*(0.62-0.32*{E})'),           # push-in, drifting upward
    'scene6': (f'1.06+0.04*{E}', f'(iw-iw/zoom)*{E}', '(ih-ih/zoom)*0.5'),                   # left→right pan, slight zoom
    'scene7': (f'1.12-0.12*{E}', 'iw*0.6-(iw/zoom)*0.6', 'ih*0.7-(ih/zoom)*0.7'),             # pull-out from the desk
}
for name, (z, x, y) in MOVES.items():
    ff('-i', str(SRC / f'{name}.jpg'),
       '-vf', (f'scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},'
               f'scale={W * 4}:{H * 4}:flags=lanczos,'
               f"zoompan=z='{z}':x='{x}':y='{y}':d={N}:s={W}x{H}:fps={FPS},setsar=1"),
       '-frames:v', str(N), *ENC, str(WORK / f'{name}.mp4'))

# 3) join with 0.6 s crossfades
ORDER = [('clip1', 1, 10.0), ('scene2', 2, KB), ('clip3', 3, 10.0), ('scene4', 4, KB), ('scene5', 5, KB), ('scene6', 6, KB), ('scene7', 7, KB)]
inputs, chain, prev, t = [], [], '[0:v]', ORDER[0][2]
for i, (f, _, d) in enumerate(ORDER):
    inputs += ['-i', str(WORK / f'{f}.mp4')]
for i in range(1, len(ORDER)):
    off = t - XF
    lab = f'[x{i}]'
    chain.append(f'{prev}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}{lab}')
    prev, t = lab, off + ORDER[i][2]
total = t
landing = SRC / 'landing.mp4'
ff(*inputs, '-filter_complex', ';'.join(chain), '-map', prev, *ENC, '-movflags', '+faststart', str(landing))

# poster (first frame)
(OUT).mkdir(parents=True, exist_ok=True)
ff('-i', str(landing), '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '80', str(OUT / 'poster.webp'))

# 4) frames (~180)
fps = TARGET_FRAMES / total
d = OUT / 'desktop'
d.mkdir(exist_ok=True)
for old in d.glob('f_*.webp'):
    old.unlink()
ff('-i', str(landing), '-vf', f'fps={fps:.6f},scale=1600:900:flags=lanczos', '-c:v', 'libwebp', '-quality', str(DQ), '-compression_level', '6',
   str(d / 'f_%04d.webp'))

# Mobile: 9:16 crop that is centred everywhere except scene 3 (two people at the frame edges), where it eases from
# centre to her during the crossfade in, pans slowly to him across the scene, and eases back during the crossfade out.
from PIL import Image  # noqa: E402

full = WORK / 'full'
full.mkdir(exist_ok=True)
for old in full.glob('*.png'):
    old.unlink()
ff('-i', str(landing), '-vf', f'fps={fps:.6f}', str(full / 'f_%04d.png'))
CW = round(H * 9 / 16)  # 608
CENTRE, HER, HIM = (W - CW) / 2, 90, 1230
s3 = sum(d_ - XF for _, _, d_ in ORDER[:2])  # scene 3 start on the final timeline
s3_end = s3 + ORDER[2][2]
ease = lambda u: (lambda v: v * v * (3 - 2 * v))(min(1.0, max(0.0, u)))
lerp = lambda a, b, u: a + (b - a) * ease(u)


def crop_x(t: float) -> float:
    if t < s3 or t > s3_end:
        return CENTRE
    if t < s3 + XF:
        return lerp(CENTRE, HER, (t - s3) / XF)
    if t < s3_end - XF:
        return lerp(HER, HIM, (t - s3 - XF) / (ORDER[2][2] - 2 * XF))
    return lerp(HIM, CENTRE, (t - (s3_end - XF)) / XF)


d = OUT / 'mobile'
d.mkdir(exist_ok=True)
for old in d.glob('f_*.webp'):
    old.unlink()
for i, src in enumerate(sorted(full.glob('f_*.png'))):
    x = round(crop_x(i / fps))
    Image.open(src).convert('RGB').crop((x, 0, x + CW, H)).resize((720, 1280), Image.LANCZOS).save(
        d / src.with_suffix('.webp').name, 'WEBP', quality=MQ, method=6)

# 5) manifest — chapter boundaries at crossfade midpoints
starts, s = [], 0.0
for _, _, d in ORDER:
    starts.append(s)
    s += d - XF
chapters = []
for i, (_, scene, d) in enumerate(ORDER):
    a = starts[i] + (XF / 2 if i else 0)
    b = starts[i] + d - (XF / 2 if i < len(ORDER) - 1 else 0)
    chapters.append({'scene': scene, 'startProgress': round(a / total, 4), 'endProgress': round(b / total, 4)})
count = lambda k: len(list((OUT / k).glob('f_*.webp')))
manifest = {
    'desktop': {'count': count('desktop'), 'width': 1600, 'height': 900},
    'mobile': {'count': count('mobile'), 'width': 720, 'height': 1280},
    'duration': round(total, 3),
    'chapters': chapters,
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
print(f'fps for frames: {fps:.4f}')
