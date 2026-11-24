#!/usr/bin/env python3
import os
import zipfile

BASE_DIR = "/home/matej/Projects/formSolver"
XPI_NAME = "forms-solver@matej.local.xpi"
XPI_PATH = os.path.join(BASE_DIR, XPI_NAME)

FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "content.css",
    "popup.html",
    "popup.css",
    "popup.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
]

with zipfile.ZipFile(XPI_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
    for rel_path in FILES:
        zf.write(os.path.join(BASE_DIR, rel_path), rel_path)

print(f"Built {XPI_PATH}")
