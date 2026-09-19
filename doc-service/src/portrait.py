"""Cuts the holder's photo out of a driving licence / qualification card /
tachograph card, for the driver's file (dossier).

Face detection (OpenCV Haar cascade) finds the portrait, then the box is
grown to the printed ID-photo proportions (3:4) with a margin. Only the
*main* portrait is returned: EU cards also print a small ghost image, which
is smaller than the main one and ignored.
"""
import cv2
import numpy as np
from PIL import Image

_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


DETECT_EDGE = 1200  # face detection at full phone-photo size costs hundreds of MB for no gain


def extract_portrait(card: Image.Image) -> Image.Image | None:
    scale = min(1.0, DETECT_EDGE / max(card.size))
    small = card.convert("L").resize((round(card.width * scale), round(card.height * scale))) if scale < 1 else card.convert("L")
    gray = np.array(small)
    min_side = max(30, min(gray.shape) // 8)
    faces = _CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_side, min_side))
    if len(faces) == 0:
        return None
    x, y, w, h = (value / scale for value in max(faces, key=lambda f: f[2] * f[3]))

    # face -> ID photo: wider than the face, taller than wide (4:5), the
    # head sits in the upper part with shoulders below
    width = w * 1.7
    height = width * 1.25
    left = x + w / 2 - width / 2
    top = y - h * 0.5
    box = (
        max(round(left), 0),
        max(round(top), 0),
        min(round(left + width), card.width),
        min(round(top + height), card.height),
    )
    return card.crop(box) if box[2] - box[0] > 20 and box[3] - box[1] > 20 else None
