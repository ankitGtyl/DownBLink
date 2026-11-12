import re
import time
from urllib.parse import urlparse, parse_qs
from typing import Dict, Any, List, Optional
import yt_dlp
import httpx
from app.config import FFMPEG_EXE, NODE_EXE, DISKWALA_API_KEY, DISKWALA_PROXY_URL, DISKWALA_COOKIE, TERABOX_COOKIE, TERABOX_API_URL

PLATFORM_PATTERNS = [
    ("terabox", r"(?:https?:\/\/)?(?:www\.)?(?:terabox\.com|1024tera\.com|teraboxapp\.com|teraboxlink\.com|terasharelink\.com|terafileshare\.com|4funbox\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|tibibox\.com)\b", "TeraBox", "fas fa-cube", "#00B0FF"),
    ("diskwala", r"(?:https?:\/\/)?(?:www\.)?(?:diskwala\.com|thediskwala\.com|diskwala\.link|diskwala\.in)\b", "DiskWala", "fas fa-compact-disc", "#00FF87"),
    ("youtube", r"(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\b", "YouTube", "fab fa-youtube", "#FF0000"),
    ("instagram", r"(?:https?:\/\/)?(?:www\.)?(?:instagram\.com)\b", "Instagram", "fab fa-instagram", "#E1306C"),
    ("tiktok", r"(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)\b", "TikTok", "fab fa-tiktok", "#00F2FE"),
    ("twitter", r"(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\b", "X / Twitter", "fab fa-x-twitter", "#FFFFFF"),
    ("facebook", r"(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)\b", "Facebook", "fab fa-facebook", "#1877F2"),
    ("reddit", r"(?:https?:\/\/)?(?:www\.)?(?:reddit\.com|v\.redd\.it)\b", "Reddit", "fab fa-reddit", "#FF4500"),
    ("vimeo", r"(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com)\b", "Vimeo", "fab fa-vimeo", "#1AB7EA"),
    ("pinterest", r"(?:https?:\/\/)?(?:www\.)?(?:pinterest\.com|pin\.it)\b", "Pinterest", "fab fa-pinterest", "#E60023"),
    ("twitch", r"(?:https?:\/\/)?(?:www\.)?(?:twitch\.tv)\b", "Twitch", "fab fa-twitch", "#9146FF"),
    ("dailymotion", r"(?:https?:\/\/)?(?:www\.)?(?:dailymotion\.com|dai\.ly)\b", "Dailymotion", "fas fa-play-circle", "#0066DC"),
    ("soundcloud", r"(?:https?:\/\/)?(?:www\.)?(?:soundcloud\.com)\b", "SoundCloud", "fab fa-soundcloud", "#FF5500"),
    ("threads", r"(?:https?:\/\/)?(?:www\.)?(?:threads\.net)\b", "Threads", "fas fa-at", "#FFFFFF"),
    ("bilibili", r"(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com)\b", "Bilibili", "fas fa-tv", "#00A1D6"),
]

# Fast in-memory cache: { url: (timestamp, data) }
METADATA_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
CACHE_TTL = 1800  # 30 minutes

# Persistent singleton YoutubeDL instance for connection pooling & fast re-use
_YDL_SINGLETON: Optional[yt_dlp.YoutubeDL] = None

def get_ydl_instance() -> yt_dlp.YoutubeDL:
    global _YDL_SINGLETON
    if _YDL_SINGLETON is None:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'noplaylist': True,
            'socket_timeout': 10,
            'ffmpeg_location': FFMPEG_EXE,
            'js_runtimes': {'node': {'path': NODE_EXE}},
            'retries': 2,
        }
        _YDL_SINGLETON = yt_dlp.YoutubeDL(opts)
    return _YDL_SINGLETON

def detect_platform(url: str) -> Dict[str, str]:
    """Detects platform from the given video URL."""
    url = url.strip()
    for key, pattern, name, icon, color in PLATFORM_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return {
                "key": key,
                "name": name,
                "icon": icon,
                "color": color,
                "matched": True
            }
    return {
        "key": "generic",
        "name": "Web Video",
        "icon": "fas fa-globe",
        "color": "#00FF87",
        "matched": False
    }

def format_filesize(size_in_bytes: Optional[int]) -> str:
    """Formats bytes into human readable string."""
    if not size_in_bytes or size_in_bytes <= 0:
        return "Estimated"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_in_bytes < 1024.0:
            return f"{size_in_bytes:.1f} {unit}"
        size_in_bytes /= 1024.0
    return f"{size_in_bytes:.1f} TB"

def format_duration(seconds: Optional[int]) -> str:
    """Formats duration in seconds to MM:SS or HH:MM:SS."""
    if not seconds or seconds <= 0:
        return "Live / Unknown"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:d}:{m:02d}:{s:02d}"
    return f"{m:d}:{s:02d}"

def extract_diskwala(url: str) -> Dict[str, Any]:
    """Dedicated extractor for DiskWala links using official API & stream resolution."""
    clean_url = url.strip()

    m = re.search(r'/(?:app|c)/([a-zA-Z0-9_-]+)', clean_url)
    if not m:
        m = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', clean_url)
    file_id = m.group(1) if m else clean_url.rstrip('/').split('/')[-1]

    std_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Origin": "https://www.diskwala.com",
        "Referer": "https://www.diskwala.com/"
    }

    client = httpx.Client(timeout=7.0, follow_redirects=True, headers=std_headers)
    
    # 1. First attempt: Normal anonymous metadata fetch
    res = None
    try:
        res = client.post('https://udapi.diskwala.com/api/v1/file/temp_info', json={'id': file_id}, timeout=5.0)
    except Exception:
        pass

    # If anonymous fails or is restricted, fallback to Cookie-powered authentication
    if not res or res.status_code != 200:
        if DISKWALA_COOKIE:
            try:
                auth_headers = dict(std_headers)
                auth_headers["Cookie"] = DISKWALA_COOKIE
                res = client.post('https://udapi.diskwala.com/api/v1/file/temp_info', json={'id': file_id}, headers=auth_headers, timeout=6.0)
            except Exception as e:
                raise Exception(f"Cannot reach Diskwala API: {str(e)}")

    if not res or res.status_code != 200:
        raise Exception("Diskwala file not found or link has expired.")

    data = res.json()
    file_info = data.get('fileInfo', {})
    uploader = data.get('uploader', {})

    raw_name = file_info.get('name') or 'Diskwala Video'
    ext = (file_info.get('extension') or 'mp4').lower()
    size_bytes = file_info.get('size') or 0
    thumb = uploader.get('p_p') or ''
    creator = uploader.get('name') or 'DiskWala'

    # 2. Try resolving stream URL: Tier 1 (Normal Anonymous Resolution First)
    stream_url = ""
    solver_targets = [clean_url]
    if file_id and f"/app/{file_id}" not in clean_url:
        solver_targets.append(f"https://www.diskwala.com/app/{file_id}")

    for target in solver_targets:
        try:
            solver_res = client.get('https://thediskwala.com/api/diskwala-free', params={'url': target}, timeout=8.0)
            if solver_res.status_code == 200:
                s_data = solver_res.json()
                if s_data.get('success'):
                    cand = s_data.get('directUrl') or ""
                    if not cand:
                        raw_u = s_data.get('downloadUrl') or s_data.get('url') or ""
                        if "url=" in raw_u:
                            try:
                                parsed_q = parse_qs(urlparse(raw_u).query)
                                if "url" in parsed_q and parsed_q["url"]:
                                    cand = unquote(parsed_q["url"][0])
                            except Exception:
                                pass
                        if not cand and raw_u:
                            cand = f"https://thediskwala.com{raw_u}" if raw_u.startswith('/') else raw_u
                    
                    if cand:
                        stream_url = cand
                        if s_data.get('title'):
                            raw_name = s_data['title']
                        if s_data.get('thumb'):
                            thumb = s_data['thumb']
                        break
        except Exception:
            pass

    # Tier 2: Cookie-powered authenticated resolution ONLY if normal resolution failed or was restricted
    if not stream_url and DISKWALA_COOKIE:
        for target in solver_targets:
            try:
                # Extract aT token if available
                aT_match = re.search(r'aT=([a-zA-Z0-9_.-]+)', DISKWALA_COOKIE)
                aT_token = aT_match.group(1) if aT_match else ""
                auth_req_headers = {"Cookie": DISKWALA_COOKIE}
                if aT_token:
                    auth_req_headers["Authorization"] = f"Bearer {aT_token}"

                auth_solver_res = client.get(
                    'https://thediskwala.com/api/diskwala', 
                    params={'url': target}, 
                    headers=auth_req_headers,
                    timeout=8.0
                )
                if auth_solver_res.status_code == 200:
                    s_data = auth_solver_res.json()
                    cand = s_data.get('directUrl') or s_data.get('downloadUrl') or s_data.get('url') or ""
                    if cand:
                        stream_url = cand
                        break
            except Exception:
                pass

    progressive_list = [{
        "format_id": "diskwala_original",
        "ext": ext,
        "resolution": "Original Quality",
        "height": 1080,
        "filesize": size_bytes,
        "filesize_formatted": format_filesize(size_bytes),
        "direct_url": stream_url,
        "type": "progressive",
        "can_play": bool(stream_url),
        "needs_merge": False
    }]

    result = {
        "id": file_id,
        "title": raw_name,
        "description": f"Diskwala Cloud File ({format_filesize(size_bytes)}) uploaded by {creator}",
        "thumbnail": thumb,
        "duration": 0,
        "duration_formatted": "Cloud Media",
        "uploader": creator,
        "view_count": None,
        "bot_url": f"https://t.me/diskwalaplayerdownloaderbot?start={file_id}",
        "platform": {
            "key": "diskwala",
            "name": "DiskWala",
            "icon": "fas fa-compact-disc",
            "color": "#00FF87",
            "matched": True
        },
        "preview_stream_url": stream_url,
        "formats": {
            "progressive": progressive_list,
            "video_merged": [],
            "audio_only": []
        }
    }

    return result

def extract_terabox(url: str) -> Dict[str, Any]:
    """Dedicated extractor for TeraBox share links and mirrors."""
    clean_url = url.strip()
    
    parsed = urlparse(clean_url)
    qs = parse_qs(parsed.query)
    surl = ""
    if 'surl' in qs:
        surl = qs['surl'][0]
    else:
        m = re.search(r'/s/1?([a-zA-Z0-9_-]+)', parsed.path)
        if m:
            surl = m.group(1)
        else:
            surl = clean_url.rstrip('/').split('/')[-1]

    file_name = "TeraBox Video"
    size_bytes = 0
    stream_url = ""
    thumb = ""
    ext = "mp4"

    # Strategy 1: Optional custom proxy API gateway
    if TERABOX_API_URL:
        try:
            with httpx.Client(timeout=3.5, follow_redirects=True) as client:
                r = client.post(TERABOX_API_URL, json={"url": clean_url})
                if r.status_code == 200:
                    d = r.json()
                    stream_url = d.get("download_url") or d.get("dlink") or d.get("url") or ""
                    if d.get("file_name"):
                        file_name = d["file_name"]
                    if d.get("size"):
                        size_bytes = int(d["size"])
                    if d.get("thumb") or d.get("thumbnail"):
                        thumb = d.get("thumb") or d.get("thumbnail")
        except Exception:
            pass

    # Strategy 2: Direct web share/list API
    if not stream_url:
        try:
            with httpx.Client(timeout=3.5, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": f"https://www.terabox.app/sharing/link?surl={surl}"
                }
                if TERABOX_COOKIE:
                    headers["Cookie"] = TERABOX_COOKIE
                
                params = {
                    "app_id": "250528",
                    "shorturl": surl,
                    "root": "1"
                }
                res = client.get("https://www.terabox.app/share/list", params=params, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    flist = data.get("list", [])
                    if flist:
                        item = flist[0]
                        file_name = item.get("server_filename") or file_name
                        stream_url = item.get("dlink") or ""
                        size_bytes = int(item.get("size") or 0)
                        thumbs = item.get("thumbs", {})
                        thumb = thumbs.get("url3") or thumbs.get("url1") or thumbs.get("url2") or ""
        except Exception:
            pass

    if '.' in file_name:
        ext = file_name.rsplit('.', 1)[-1].lower()

    progressive_list = [{
        "format_id": "terabox_original",
        "ext": ext,
        "resolution": "Original Quality",
        "height": 1080,
        "filesize": size_bytes,
        "filesize_formatted": format_filesize(size_bytes),
        "direct_url": stream_url,
        "type": "progressive",
        "can_play": bool(stream_url and ext in ["mp4", "webm", "mkv", "mov"]),
        "needs_merge": False
    }]

    return {
        "id": surl,
        "title": file_name,
        "description": f"TeraBox Cloud File ({format_filesize(size_bytes)})",
        "thumbnail": thumb,
        "duration": 0,
        "duration_formatted": "Cloud Media",
        "uploader": "TeraBox Cloud",
        "view_count": None,
        "platform": {
            "key": "terabox",
            "name": "TeraBox",
            "icon": "fas fa-cube",
            "color": "#00B0FF",
            "matched": True
        },
        "preview_stream_url": stream_url if (stream_url and ext in ["mp4", "webm", "mkv"]) else "",
        "formats": {
            "progressive": progressive_list,
            "video_merged": [],
            "audio_only": []
        }
    }

def extract_media(url: str) -> Dict[str, Any]:
    """
    Extracts rich media metadata and categorized formats with high-speed caching
    and persistent session pooling. Supports YouTube, Instagram, TikTok, DiskWala, TeraBox, and 1000+ more.
    """
    clean_url = url.strip()

    # 1. Fast Cache Check
    now = time.time()
    if clean_url in METADATA_CACHE:
        cached_time, cached_data = METADATA_CACHE[clean_url]
        if now - cached_time < CACHE_TTL:
            return cached_data

    # Check if URL is DiskWala
    platform_info = detect_platform(clean_url)
    if platform_info["key"] == "diskwala":
        result = extract_diskwala(clean_url)
        METADATA_CACHE[clean_url] = (now, result)
        return result

    # Check if URL is TeraBox
    if platform_info["key"] == "terabox":
        result = extract_terabox(clean_url)
        METADATA_CACHE[clean_url] = (now, result)
        return result

    ydl = get_ydl_instance()
    info = ydl.extract_info(clean_url, download=False)
    
    if 'entries' in info and info['entries']:
        info = info['entries'][0]

    formats_raw = info.get('formats', [])
    
    progressive_list: List[Dict[str, Any]] = []
    video_only_list: List[Dict[str, Any]] = []
    audio_only_list: List[Dict[str, Any]] = []

    best_audio_id = None
    best_audio_bitrate = 0
    best_audio_url = ""

    # Pass 1: Audio tracks
    for f in formats_raw:
        vcodec = f.get('vcodec') or 'none'
        acodec = f.get('acodec') or 'none'
        url_target = f.get('url') or ''
        
        if vcodec == 'none' and acodec != 'none':
            abr = f.get('abr') or f.get('tbr') or 0
            bitrate_str = f"{int(abr)} kbps" if abr > 0 else (f.get('format_note') or "Audio")
            size = f.get('filesize') or f.get('filesize_approx')

            item = {
                "format_id": f.get('format_id'),
                "ext": f.get('ext') or 'mp3',
                "quality_label": bitrate_str,
                "bitrate": abr,
                "filesize": size,
                "filesize_formatted": format_filesize(size),
                "direct_url": url_target,
                "type": "audio"
            }
            audio_only_list.append(item)

            if abr > best_audio_bitrate and url_target:
                best_audio_bitrate = abr
                best_audio_id = f.get('format_id')
                best_audio_url = url_target

    if not best_audio_url and audio_only_list:
        best_audio_url = audio_only_list[0]['direct_url']
        best_audio_id = audio_only_list[0]['format_id']

    # Pass 2: Video streams
    seen_res = set()
    for f in formats_raw:
        vcodec = f.get('vcodec') or 'none'
        acodec = f.get('acodec') or 'none'
        url_target = f.get('url') or ''
        height = f.get('height') or 0
        fps = f.get('fps')
        ext = f.get('ext') or 'mp4'

        res_label = f"{height}p" if height > 0 else (f.get('resolution') or f.get('format_note') or "Standard")
        if fps and fps > 30 and height > 0:
            res_label += f"{int(fps)}"

        size = f.get('filesize') or f.get('filesize_approx')

        # Progressive
        if vcodec != 'none' and acodec != 'none':
            progressive_list.append({
                "format_id": f.get('format_id'),
                "ext": ext,
                "resolution": res_label,
                "height": height or 360,
                "filesize": size,
                "filesize_formatted": format_filesize(size),
                "direct_url": url_target,
                "type": "progressive",
                "can_play": True,
                "needs_merge": False
            })

        # Video only (DASH/HLS)
        elif vcodec != 'none' and acodec == 'none':
            key = f"{height}_{ext}"
            if key not in seen_res:
                seen_res.add(key)
                total_size = (size or 0) + int(best_audio_bitrate * (info.get('duration') or 0) * 128) if size else size
                video_only_list.append({
                    "format_id": f.get('format_id'),
                    "ext": ext,
                    "resolution": res_label,
                    "height": height or 720,
                    "filesize": total_size,
                    "filesize_formatted": format_filesize(total_size),
                    "direct_url": url_target,
                    "best_audio_id": best_audio_id,
                    "type": "video_merge",
                    "can_play": False,
                    "needs_merge": True
                })

    progressive_list.sort(key=lambda x: x.get('height') or 0, reverse=True)
    video_only_list.sort(key=lambda x: x.get('height') or 0, reverse=True)
    audio_only_list.sort(key=lambda x: x.get('bitrate') or 0, reverse=True)

    # Preview stream selection
    preview_stream_url = ""
    for p in progressive_list:
        if p.get('direct_url'):
            preview_stream_url = p['direct_url']
            if 360 <= (p.get('height') or 0) <= 720:
                break

    if not preview_stream_url and progressive_list:
        preview_stream_url = progressive_list[0].get('direct_url', '')

    if not preview_stream_url and video_only_list:
        preview_stream_url = video_only_list[0].get('direct_url', '')

    if not preview_stream_url and info.get('url'):
        preview_stream_url = info.get('url')

    result = {
        "id": info.get('id', 'unknown'),
        "title": info.get('title', 'Unknown Title'),
        "description": info.get('description', '')[:300] if info.get('description') else '',
        "thumbnail": info.get('thumbnail') or (info.get('thumbnails')[-1].get('url') if info.get('thumbnails') else ''),
        "duration": info.get('duration', 0),
        "duration_formatted": format_duration(info.get('duration')),
        "uploader": info.get('uploader') or info.get('channel') or info.get('creator') or 'Unknown Creator',
        "view_count": info.get('view_count'),
        "platform": platform_info,
        "preview_stream_url": preview_stream_url,
        "formats": {
            "progressive": progressive_list,
            "video_merged": video_only_list,
            "audio_only": audio_only_list
        }
    }

    METADATA_CACHE[clean_url] = (now, result)
    return result
