from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse

from app.dependencies import get_db
from app.services.spotify import SpotifyService

router = APIRouter(prefix="/api/spotify", tags=["spotify"])

_AUTH_SUCCESS_HTML = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Spotify connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee;">
<div style="text-align:center">
  <p style="font-size:1.2rem">Spotify connected!</p>
  <p style="opacity:.6;font-size:.9rem">You can close this tab and return to the admin panel.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage('spotify_auth_success', '*');
      setTimeout(() => window.close(), 800);
    }
  </script>
</div>
</body>
</html>"""


@router.get("/status")
async def spotify_status(request: Request) -> dict:
    service: SpotifyService = request.app.state.spotify
    return {"authorized": service.is_authorized(), "configured": service.is_configured()}


@router.get("/auth")
async def spotify_auth(request: Request) -> dict:
    service: SpotifyService = request.app.state.spotify
    if not service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Spotify credentials not configured. "
                "Set GLASSISTANT_SPOTIFY_CLIENT_ID and GLASSISTANT_SPOTIFY_CLIENT_SECRET in .env."
            ),
        )
    try:
        auth_url = service.get_auth_url()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return {"auth_url": auth_url}


@router.get("/callback")
async def spotify_callback(
    request: Request,
    code: str | None = Query(None),
    error: str | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
) -> HTMLResponse:
    if error:
        return HTMLResponse(
            f'<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">'
            f"<p>Authorization failed: {error}</p></body></html>",
            status_code=400,
        )
    if not code:
        return HTMLResponse(
            '<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">'
            "<p>Missing authorization code.</p></body></html>",
            status_code=400,
        )
    service: SpotifyService = request.app.state.spotify
    try:
        await service.exchange_code(code, db)
    except Exception as e:
        return HTMLResponse(
            f'<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">'
            f"<p>Token exchange failed: {e}</p></body></html>",
            status_code=500,
        )
    return HTMLResponse(_AUTH_SUCCESS_HTML)


@router.get("/now-playing")
async def now_playing(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    service: SpotifyService = request.app.state.spotify
    if not service.is_authorized():
        return {"track": None, "authorized": False}
    try:
        track = await service.get_now_playing(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify upstream failed: {e}",
        )
    return {"track": track.to_dict() if track else None, "authorized": True}
