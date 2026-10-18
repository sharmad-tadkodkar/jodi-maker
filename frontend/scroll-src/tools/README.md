# Landing scroll film — build tools

Regenerates `frontend/public/scroll/` (poster, desktop/mobile frames, manifest) from the stills and clips here.
Needs ffmpeg (a static build is fine, e.g. `pip install imageio-ffmpeg`) and Python with numpy + opencv-python-headless.

```bash
FF=$(command -v ffmpeg)            # or: python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"
WORK=/tmp/jodi-film && mkdir -p $WORK
# 1) remove the Gemini sparkle from the clips (reverse its 0.29-opacity white overlay; clip3 also inpaints the edge)
python tools/unsparkle_video.py $FF clip1.mp4 $WORK/clip1-clean.mp4 1157.5 598 24 0.29 0
python tools/unsparkle_video.py $FF clip3.mp4 $WORK/clip3-clean.mp4 1157.5 598 24 0.29 0.16
# 2) normalise, Ken Burns stills, crossfade → landing.mp4, poster, frames, manifest   (run from frontend/)
#    Mobile frames are a centred 9:16 crop, except scene 3: eased pan from her (x≈90) to him (x≈1230).
#    Needs Pillow too.
cd .. && python scroll-src/tools/build_film.py $FF scroll-src public/scroll $WORK 70 65
```
