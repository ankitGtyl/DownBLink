import os
import shutil
from pathlib import Path
import imageio_ffmpeg
from dotenv import load_dotenv

# Load local environment variables from .env file
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Discover FFmpeg executable (prefers system ffmpeg if available, otherwise imageio static binary)
FFMPEG_EXE = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()

# Discover Node.js executable for yt-dlp JS challenge execution
NODE_EXE = shutil.which("node") or "node"

# Cleanup settings
FILE_MAX_AGE_SECONDS = 3600  # 1 hour TTL for downloaded files

# Optional Diskwala API Proxy & Session Integration
DISKWALA_API_KEY = os.getenv("DISKWALA_API_KEY", "")
DISKWALA_PROXY_URL = os.getenv("DISKWALA_PROXY_URL", "https://api.diskwaladevapi.in/v1/extract")
DISKWALA_COOKIE = os.getenv("DISKWALA_COOKIE", "")

# Optional TeraBox Cookie / Proxy Integration
TERABOX_COOKIE = os.getenv("TERABOX_COOKIE", "")
TERABOX_API_URL = os.getenv("TERABOX_API_URL", "")

