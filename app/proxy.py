import httpx
import re
from urllib.parse import urlparse, parse_qs, unquote
from typing import Optional
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse
from app.config import DISKWALA_COOKIE

# Persistent Connection Pool for ultra-fast chunk fetching with keep-alive
_STREAMING_CLIENT: Optional[httpx.AsyncClient] = None

def get_streaming_client() -> httpx.AsyncClient:
    global _STREAMING_CLIENT
    if _STREAMING_CLIENT is None or _STREAMING_CLIENT.is_closed:
        limits = httpx.Limits(max_keepalive_connections=100, max_connections=300, keepalive_expiry=120.0)
        timeout = httpx.Timeout(connect=15.0, read=None, write=60.0, pool=30.0)
        _STREAMING_CLIENT = httpx.AsyncClient(
            timeout=timeout,
            limits=limits,
            follow_redirects=True,
            verify=False
        )
    return _STREAMING_CLIENT

def unwrap_stream_url(stream_url: str) -> str:
    """Unwraps intermediate stream proxy URLs to access the direct high-speed CDN stream."""
    clean = unquote(stream_url)
    if "api/stream" in clean and "url=" in clean:
        try:
            parsed = urlparse(clean)
            qs = parse_qs(parsed.query)
            if "url" in qs and qs["url"]:
                candidate = qs["url"][0]
                if candidate.startswith("http://") or candidate.startswith("https://"):
                    return candidate
        except Exception:
            pass
    return stream_url

async def proxy_video_stream(stream_url: str, request: Request) -> StreamingResponse:
    """
    Streams media content from upstream CDN to client browser at maximum speed,
    forwarding HTTP Byte-Range requests for seamless seeking/scrubbing in HTML5 video player.
    """
    target_url = unwrap_stream_url(stream_url)

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    }

    # Forward Range header if present for seek and scrub support
    range_header = request.headers.get("range")
    if range_header:
        req_headers["Range"] = range_header

    # Attach required referer for DiskWala CDN & TeraBox PCS nodes
    if any(k in target_url for k in ["terabox", "baidupcs", "1024tera", "kingx.dev", "teradl"]):
        req_headers["Referer"] = "https://www.terabox.app/"
    elif "diskwala.com" in target_url:
        req_headers["Referer"] = "https://www.diskwala.com/"

    client = get_streaming_client()

    try:
        upstream_req = client.build_request("GET", target_url, headers=req_headers)
        upstream_resp = await client.send(upstream_req, stream=True)

        # If normal anonymous request fails with 401/403 or host restriction, fallback to session cookie
        if upstream_resp.status_code in (401, 403) and DISKWALA_COOKIE:
            await upstream_resp.aclose()
            auth_headers = dict(req_headers)
            auth_headers["Cookie"] = DISKWALA_COOKIE
            upstream_req = client.build_request("GET", target_url, headers=auth_headers)
            upstream_resp = await client.send(upstream_req, stream=True)

        if upstream_resp.status_code not in (200, 206):
            await upstream_resp.aclose()
            raise HTTPException(
                status_code=upstream_resp.status_code, 
                detail=f"Upstream returned HTTP {upstream_resp.status_code}"
            )

        resp_headers = {
            "Content-Type": upstream_resp.headers.get("Content-Type", "video/mp4"),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff",
        }

        if "Content-Length" in upstream_resp.headers:
            resp_headers["Content-Length"] = upstream_resp.headers["Content-Length"]
        if "Content-Range" in upstream_resp.headers:
            resp_headers["Content-Range"] = upstream_resp.headers["Content-Range"]

        async def stream_generator():
            try:
                # aiter_raw() streams network packets immediately without waiting for buffer accumulation
                async for chunk in upstream_resp.aiter_raw():
                    yield chunk
            finally:
                await upstream_resp.aclose()

        return StreamingResponse(
            stream_generator(),
            status_code=upstream_resp.status_code,
            headers=resp_headers
        )

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to media host: {str(e)}")
