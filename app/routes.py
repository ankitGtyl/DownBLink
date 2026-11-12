import asyncio
import io
import re
import socket
from typing import Optional
from pathlib import Path
from urllib.parse import quote, unquote
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import httpx
import qrcode
from app.config import BASE_DIR, DOWNLOADS_DIR, DISKWALA_COOKIE
from app.extractor import detect_platform, extract_media
from app.merger import start_merge_job, get_job_status
from app.proxy import proxy_video_stream, unwrap_stream_url

router = APIRouter()
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

class ExtractRequest(BaseModel):
    url: str

class MergeRequest(BaseModel):
    url: str
    format_id: str
    audio_id: str = None
    is_audio_only: bool = False
    ext: str = "mp4"

@router.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@router.get("/api/detect")
async def detect_platform_route(url: str = Query(..., description="Target video URL")):
    return detect_platform(url)

@router.post("/api/extract")
async def extract_media_route(payload: ExtractRequest):
    clean_url = payload.url.strip() if payload.url else ""
    if not clean_url:
        raise HTTPException(status_code=400, detail="Video URL is required")
    
    try:
        data = await asyncio.to_thread(extract_media, clean_url)
        return data
    except Exception as e:
        error_msg = str(e)
        if "Incomplete YouTube ID" in error_msg or "truncated" in error_msg:
            raise HTTPException(status_code=400, detail="Incomplete or truncated video URL. Please make sure the full video link is pasted.")
        if "Unsupported URL" in error_msg:
            raise HTTPException(status_code=400, detail="This URL is not supported or not recognized.")
        if any(w in error_msg.lower() for w in ["sign in", "login", "logged-in", "cookies", "private", "account"]):
            raise HTTPException(status_code=403, detail="This content requires account login, cookies, or is private/age-restricted.")
        raise HTTPException(status_code=400, detail=f"Extraction error: {error_msg}")

@router.get("/api/stream")
async def stream_media_route(stream_url: str = Query(..., description="Target stream URL"), request: Request = None):
    return await proxy_video_stream(stream_url, request)

@router.get("/api/download-stream")
async def direct_stream_download(
    stream_url: str = Query(...), 
    filename: str = Query("video"), 
    ext: str = Query("mp4"), 
    filesize: Optional[int] = Query(None),
    request: Request = None
):
    """
    Pipes upstream video directly into browser download with Content-Disposition attachment.
    Supports large files (2GB+) with resumable Byte-Ranges, explicit Content-Length, and infinite stream timeouts.
    """
    target_url = unwrap_stream_url(stream_url)
    safe_title = re.sub(r'[\\/*?:"<>|]', "", filename).strip()[:80] or "video"
    full_filename = f"{safe_title}.{ext}"
    encoded_filename = quote(full_filename)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
    }
    if any(k in target_url for k in ["terabox", "baidupcs", "1024tera", "kingx.dev", "teradl"]):
        headers["Referer"] = "https://www.terabox.app/"
    elif "diskwala.com" in target_url:
        headers["Referer"] = "https://www.diskwala.com/"

    # Forward Range request for resumable 2GB+ downloads
    range_header = None
    if request:
        range_header = request.headers.get("range")
        if range_header:
            headers["Range"] = range_header

    # Infinite read timeout for long 2GB+ file transfers
    stream_timeout = httpx.Timeout(connect=20.0, read=None, write=60.0, pool=None)
    client = httpx.AsyncClient(timeout=stream_timeout, follow_redirects=True, verify=False)
    try:
        upstream_req = client.build_request("GET", target_url, headers=headers)
        upstream_resp = await client.send(upstream_req, stream=True)

        # Fallback to session cookie only if normal anonymous download returns 401/403 or host restriction
        if upstream_resp.status_code in (401, 403) and DISKWALA_COOKIE:
            await upstream_resp.aclose()
            auth_headers = dict(headers)
            auth_headers["Cookie"] = DISKWALA_COOKIE
            upstream_req = client.build_request("GET", target_url, headers=auth_headers)
            upstream_resp = await client.send(upstream_req, stream=True)

        if upstream_resp.status_code not in (200, 206):
            await upstream_resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=upstream_resp.status_code, detail="Cannot stream media from CDN")

        content_type = upstream_resp.headers.get("Content-Type", "")
        # Prevent downloading HTML landing pages as fake corrupted videos
        if "text/html" in content_type:
            await upstream_resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=400, detail="The link points to a web landing page instead of a video stream. Direct download is restricted by the host.")

        resp_headers = {
            "Content-Disposition": f'attachment; filename="{full_filename}"; filename*=UTF-8\'\'{encoded_filename}',
            "Content-Type": upstream_resp.headers.get("Content-Type", "application/octet-stream"),
            "Accept-Ranges": "bytes",
        }

        # Resolve exact Content-Length so browser counts progress accurately (e.g. 8.2MB / 8.2MB)
        if "Content-Length" in upstream_resp.headers:
            resp_headers["Content-Length"] = upstream_resp.headers["Content-Length"]
        elif filesize and filesize > 0 and not range_header:
            resp_headers["Content-Length"] = str(filesize)
        elif "Content-Range" in upstream_resp.headers:
            # Extract total size from bytes 0-1000/8241520
            cr = upstream_resp.headers["Content-Range"]
            if "/" in cr:
                total_str = cr.split("/")[-1].strip()
                if total_str.isdigit() and not range_header:
                    resp_headers["Content-Length"] = total_str

        if "Content-Range" in upstream_resp.headers:
            resp_headers["Content-Range"] = upstream_resp.headers["Content-Range"]

        async def stream_chunks():
            try:
                # 256 KB chunk buffer for high-throughput transfers
                async for chunk in upstream_resp.aiter_bytes(chunk_size=256 * 1024):
                    yield chunk
            finally:
                await upstream_resp.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_chunks(),
            status_code=upstream_resp.status_code,
            headers=resp_headers
        )
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Download stream error: {str(e)}")

@router.post("/api/merge")
async def start_merge_route(payload: MergeRequest):
    job_id = start_merge_job(
        url=payload.url,
        format_id=payload.format_id,
        audio_id=payload.audio_id,
        is_audio_only=payload.is_audio_only,
        target_ext=payload.ext
    )
    return {"job_id": job_id, "status": "queued"}

@router.get("/api/merge/status/{job_id}")
async def get_merge_status_route(job_id: str):
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/api/download/{filename:path}")
async def download_file_route(filename: str):
    from urllib.parse import unquote
    clean_decoded = unquote(filename)
    file_path = DOWNLOADS_DIR / clean_decoded
    if not file_path.exists() or not file_path.is_file():
        # try as-is
        file_path = DOWNLOADS_DIR / filename
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Requested file not found or expired.")
    
    parts = file_path.name.split("_", 1)
    clean_name = parts[1] if len(parts) > 1 else file_path.name

    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        filename=clean_name
    )

@router.get("/api/download-thumbnail")
async def download_thumbnail_route(thumb_url: str = Query(...), filename: str = Query("thumbnail")):
    """Pipes high-resolution thumbnail image directly to browser download."""
    clean_thumb = unquote(thumb_url)
    safe_name = re.sub(r'[\\/*?:"<>|]', "", filename).strip()[:80] or "thumbnail"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/*,*/*"
    }

    client = httpx.AsyncClient(timeout=20.0, follow_redirects=True, verify=False)
    try:
        req = client.build_request("GET", clean_thumb, headers=headers)
        resp = await client.send(req, stream=True)
        if resp.status_code != 200:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail="Cannot fetch thumbnail from host")

        c_type = resp.headers.get("Content-Type", "image/jpeg")
        ext = "jpg"
        if "png" in c_type:
            ext = "png"
        elif "webp" in c_type:
            ext = "webp"

        full_name = f"{safe_name}_thumb.{ext}"
        encoded_name = quote(full_name)

        resp_headers = {
            "Content-Disposition": f'attachment; filename="{full_name}"; filename*=UTF-8\'\'{encoded_name}',
            "Content-Type": c_type
        }

        async def stream_img():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(stream_img(), status_code=200, headers=resp_headers)
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Thumbnail download error: {str(e)}")

@router.get("/api/info/lan-ip")
async def get_lan_ip_route():
    """Returns local LAN IP so phones on the same Wi-Fi can connect via QR code."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return {"lan_ip": ip, "port": 8000}

@router.get("/api/qr")
async def generate_qr_route(text: str = Query(...)):
    """Generates crisp high-contrast PNG QR code in memory."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    
    return Response(content=buf.getvalue(), media_type="image/png")

