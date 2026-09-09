# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None
ROOT_DIR = Path.cwd()

datas = [
    (str(ROOT_DIR / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT_DIR / "backend"), "backend"),
]

# Collect package data files
datas += collect_data_files("fastapi")
datas += collect_data_files("starlette")
datas += collect_data_files("uvicorn")
datas += collect_data_files("google.genai")

packages_to_collect = [
    "uvicorn",
    "fastapi",
    "starlette",
    "sqlalchemy",
    "pydantic",
    "pydantic_settings",
    "backend",
    "google.genai",
    "dotenv",
    "aiofiles",
    "httpx",
    "numpy",
]

hidden_imports = []
for pkg in packages_to_collect:
    hidden_imports.extend(collect_submodules(pkg))

# Explicit dynamic imports
hidden_imports.extend([
    "fastapi.middleware.cors",
    "starlette.middleware.cors",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "sqlalchemy.dialects.sqlite",
    "dotenv",
    "aiofiles",
])
hidden_imports = sorted(list(set(hidden_imports)))

a = Analysis(
    ["run.py"],
    pathex=[str(ROOT_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="Automated-Gemini-TTS",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
