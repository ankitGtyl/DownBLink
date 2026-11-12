import os
import re
import time
import uuid
import threading
from urllib.parse import quote, unquote
from typing import Dict, Any, Optional
from pathlib import Path
import yt_dlp
from app.config import DOWNLOADS_DIR, FFMPEG_EXE, NODE_EXE, FILE_MAX_AGE_SECONDS

# In-memory job registry for tracking active and completed jobs
JOBS: Dict[str, Dict[str, Any]] = {}

def sanitize_filename(name: str) -> str:
    """Sanitizes filename for cross-platform compatibility."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = clean.strip()
    return clean[:100] if clean else "video"

def cleanup_old_files():
    """Removes downloaded files older than FILE_MAX_AGE_SECONDS."""
    now = time.time()
    try:
        for file_path in DOWNLOADS_DIR.glob("*.*"):
            if file_path.is_file():
                if now - file_path.stat().st_mtime > FILE_MAX_AGE_SECONDS:
                    file_path.unlink(missing_ok=True)
    except Exception as e:
        print(f"Cleanup error: {e}")

def run_download_job(job_id: str, url: str, format_spec: str, is_audio_only: bool = False, target_ext: str = "mp4"):
    """
    Background worker that runs multi-threaded yt-dlp to download and merge formats.
    """
    job = JOBS.get(job_id)
    if not job:
        return

    job["status"] = "downloading"
    job["progress"] = 10

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            if total > 0:
                pct = int((downloaded / total) * 85)
                job["progress"] = max(10, min(85, pct))
                job["speed"] = d.get('speed')
                job["eta"] = d.get('eta')
        elif d['status'] == 'finished':
            job["status"] = "merging"
            job["progress"] = 92

    try:
        cleanup_old_files()

        out_template = str(DOWNLOADS_DIR / f"{job_id}_%(title).100B.%(ext)s")

        ydl_opts: Dict[str, Any] = {
            'outtmpl': out_template,
            'format': format_spec,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,                     # CRITICAL: Never download entire playlist on a single video link
            'concurrent_fragment_downloads': 8,     # 8 parallel threads for multi-threaded fast download
            'buffersize': 1024 * 1024,              # 1 MB memory buffer
            'http_chunk_size': 10485760,            # 10 MB chunks
            'socket_timeout': 15,
            'ffmpeg_location': FFMPEG_EXE,
            'js_runtimes': {'node': {'path': NODE_EXE}},
            'progress_hooks': [progress_hook],
        }

        if is_audio_only:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        else:
            clean_ext = (target_ext or 'mp4').lower()
            ydl_opts['merge_output_format'] = clean_ext if clean_ext in ['mp4', 'webm', 'mkv'] else 'mp4'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
            # Find the generated output file matching job_id
            matched_file = None
            for f in DOWNLOADS_DIR.iterdir():
                # Avoid temporary intermediate files (.part, .ytdl)
                if f.name.startswith(job_id) and not f.name.endswith(('.part', '.ytdl')):
                    matched_file = f
                    break

            if matched_file and matched_file.exists():
                job["status"] = "completed"
                job["progress"] = 100
                job["filename"] = matched_file.name
                job["filesize"] = matched_file.stat().st_size
                job["download_url"] = f"/api/download/{quote(matched_file.name)}"
            else:
                raise Exception("Output file was not found after processing.")

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)

def start_merge_job(url: str, format_id: str, audio_id: Optional[str] = None, is_audio_only: bool = False, target_ext: str = "mp4") -> str:
    """Initializes and dispatches a background merge download job."""
    job_id = uuid.uuid4().hex[:12]
    
    if is_audio_only:
        format_spec = format_id if format_id else "bestaudio/best"
    elif audio_id and format_id:
        format_spec = f"{format_id}+{audio_id}/bestvideo+bestaudio/best"
    elif format_id:
        format_spec = f"{format_id}+bestaudio/best"
    else:
        format_spec = "bestvideo+bestaudio/best"

    JOBS[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 5,
        "created_at": time.time(),
        "format_spec": format_spec,
        "is_audio_only": is_audio_only,
        "target_ext": target_ext
    }

    thread = threading.Thread(
        target=run_download_job,
        args=(job_id, url, format_spec, is_audio_only, target_ext),
        daemon=True
    )
    thread.start()

    return job_id

def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    """Returns the current status of a job."""
    return JOBS.get(job_id)
