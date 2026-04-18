"""
Entry point for the PyInstaller-bundled LGSS backend.
This wraps `server:app` with uvicorn so the resulting .exe can be started
without needing a separate `uvicorn` command.

When bundled as `lgss-backend.exe`, run:
    lgss-backend.exe                       # starts on 127.0.0.1:8001
    lgss-backend.exe --port 9000           # custom port
    lgss-backend.exe --host 0.0.0.0        # custom host
"""
import argparse
import os
import sys
from pathlib import Path


def _resolve_resource_dir() -> Path:
    """When frozen by PyInstaller, scum_defaults etc. live in _MEIPASS."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def main():
    parser = argparse.ArgumentParser(description="LGSS Backend Server")
    parser.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8001')))
    args = parser.parse_args()

    # Ensure working directory is the folder containing scum_defaults, .env, etc.
    os.chdir(_resolve_resource_dir())

    import uvicorn
    from server import app  # noqa: E402

    uvicorn.run(app, host=args.host, port=args.port, log_level='info')


if __name__ == '__main__':
    main()
