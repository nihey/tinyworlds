"""Panorama helpers for the street-view spike (throwaway).

Directions are world-aligned: d = (east, north, up). A Mapillary equirect has the
camera's heading (`compass`, degrees clockwise from north) at its centre column.

Cube faces, in atlas order: N, E, S, W, Up, Down. Face pixel (i, j) of size S looks
along forward + a*right + b*up, a = 2(i+.5)/S - 1, b = 1 - 2(j+.5)/S.
"""

import math

import numpy as np
from PIL import Image

FACES = [
    # forward, right, up
    ((0, 1, 0), (1, 0, 0), (0, 0, 1)),  # N
    ((1, 0, 0), (0, -1, 0), (0, 0, 1)),  # E
    ((0, -1, 0), (-1, 0, 0), (0, 0, 1)),  # S
    ((-1, 0, 0), (0, 1, 0), (0, 0, 1)),  # W
    ((0, 0, 1), (1, 0, 0), (0, -1, 0)),  # Up (image top points south)
    ((0, 0, -1), (1, 0, 0), (0, 1, 0)),  # Down (image top points north)
]
FACE_NAMES = ["n", "e", "s", "w", "up", "down"]


def sample_equirect(eq: np.ndarray, d: np.ndarray, compass: float) -> np.ndarray:
    """Bilinear sample of an equirect (H, W, 3) along unit-ish directions d (..., 3)."""
    h, w, _ = eq.shape
    e, n, u = d[..., 0], d[..., 1], d[..., 2]
    bearing = np.degrees(np.arctan2(e, n))  # clockwise from north
    elev = np.degrees(np.arctan2(u, np.hypot(e, n)))
    x = ((0.5 + (bearing - compass) / 360.0) % 1.0) * w - 0.5
    y = (0.5 - elev / 180.0) * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.clip(np.floor(y).astype(int), 0, h - 1)
    fx = (x - x0)[..., None]
    fy = (y - np.floor(y))[..., None]
    x1 = (x0 + 1) % w
    x0 = x0 % w
    y1 = np.clip(y0 + 1, 0, h - 1)
    a = eq[y0, x0] * (1 - fx) + eq[y0, x1] * fx
    b = eq[y1, x0] * (1 - fx) + eq[y1, x1] * fx
    return a * (1 - fy) + b * fy


def face(eq: np.ndarray, index: int, size: int, compass: float) -> Image.Image:
    f, r, up = (np.array(v, dtype=np.float64) for v in FACES[index])
    t = (np.arange(size) + 0.5) / size * 2 - 1
    a = t[None, :, None]
    b = -t[:, None, None]
    d = f + a * r + b * up
    out = sample_equirect(eq.astype(np.float64), d, compass)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def north_equirect(eq: np.ndarray, compass: float, width: int) -> Image.Image:
    """The panorama re-rolled so north is the centre column, resized to width × width/2."""
    h = width // 2
    lon = ((np.arange(width) + 0.5) / width - 0.5) * 2 * math.pi
    lat = (0.5 - (np.arange(h) + 0.5) / h) * math.pi
    lon, lat = np.meshgrid(lon, lat)
    d = np.stack([np.sin(lon) * np.cos(lat), np.cos(lon) * np.cos(lat), np.sin(lat)], axis=-1)
    out = sample_equirect(eq.astype(np.float64), d, compass)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def atlas(faces: list[Image.Image]) -> Image.Image:
    s = faces[0].width
    out = Image.new("RGB", (s * 6, s))
    for i, f in enumerate(faces):
        out.paste(f.resize((s, s), Image.Resampling.BOX), (i * s, 0))
    return out


def to_palette(img: Image.Image, rgb: list[list[int]]) -> Image.Image:
    """Nearest colour of a fixed palette, no dithering."""
    flat = []
    for c in rgb[:256]:
        flat += c
    flat += [0, 0, 0] * (256 - len(rgb[:256]))
    pal = Image.new("P", (1, 1))
    pal.putpalette(flat)
    return img.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")


def nearest_palette(img: Image.Image, rgb: np.ndarray) -> Image.Image:
    """Nearest colour of a palette of any size (perceptual-ish weights), no dithering."""
    px = np.asarray(img.convert("RGB"), dtype=np.float32)
    flat = px.reshape(-1, 3)
    w = np.array([0.30, 0.59, 0.11], dtype=np.float32) ** 0.5
    pal = rgb.astype(np.float32) * w
    best = np.empty(len(flat), dtype=np.int64)
    for s in range(0, len(flat), 65536):
        chunk = flat[s : s + 65536] * w
        dist = ((chunk[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
        best[s : s + 65536] = dist.argmin(1)
    return Image.fromarray(rgb[best].reshape(px.shape).astype(np.uint8))
