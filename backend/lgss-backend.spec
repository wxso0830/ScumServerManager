# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for LGSS Backend server
# Produces a single executable that contains Python + all dependencies
# Usage: pyinstaller lgss-backend.spec --noconfirm

from PyInstaller.utils.hooks import collect_submodules, collect_data_files
import os

block_cipher = None

# Collect hidden imports that PyInstaller might miss
hidden_imports = []
hidden_imports += collect_submodules('motor')
hidden_imports += collect_submodules('pymongo')
hidden_imports += collect_submodules('uvicorn')
hidden_imports += collect_submodules('fastapi')
hidden_imports += collect_submodules('starlette')
hidden_imports += collect_submodules('pydantic')
hidden_imports += collect_submodules('email_validator')
hidden_imports += collect_submodules('dns')
# discord.py loads command cogs / extensions dynamically, so PyInstaller
# won't pick up every submodule via static analysis. Pull them all in.
hidden_imports += collect_submodules('discord')
hidden_imports += collect_submodules('aiohttp')
hidden_imports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'scum_parser',
    'scum_logs',
    'scum_db',
    'scum_backup',
    'scum_process',
    'scum_discord',
    'discord',
    'discord.ext.commands',
    'discord.app_commands',
    'sqlite3',
]

# Bundle scum_defaults folder (ini/json templates) with the exe
datas = []
if os.path.isdir('scum_defaults'):
    datas += [('scum_defaults', 'scum_defaults')]


a = Analysis(
    ['server_entry.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'PIL', 'IPython', 'notebook',
        'pytest', 'black', 'mypy', 'flake8', 'isort',
        'google.generativeai', 'google.genai', 'google.ai',
        'litellm', 'openai', 'stripe', 'boto3', 'botocore',
        'pandas', 'numpy', 'tokenizers', 'huggingface_hub',
        'tiktoken', 'jq',
    ],
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
    name='lgss-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,           # show console for debugging; change to False later
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
