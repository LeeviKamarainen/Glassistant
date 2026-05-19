from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse

from app.dependencies import get_db
from app.services.calendar import CalendarService

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

_AUTH_SUCCESS_HTML = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Calendar connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee;">
<div style="text-align:center">
  <p style="font-size:1.2rem">Google Calendar connected!</p>
  <p style="opacity:.6;font-size:.9rem">You can close this tab and return to the admin panel.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage('calendar_auth_success', '*');
      setTimeout(() => window.close(), 800);
    }
  </script>
</div>
</body>
</html>"""


def _this_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.isoweekday() - 1)


@router.get("/status")
async def calendar_status(request: Request) -> dict:
    service: CalendarService = request.app.state.calendar
    return {"authorized": service.is_authorized(), "configured": service.is_configured()}


@router.get("/auth")
async def calendar_auth(request: Request) -> dict:
    service: CalendarService = request.app.state.calendar
    if not service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth credentials are not configured. Set GLASSISTANT_GOOGLE_CLIENT_ID and GLASSISTANT_GOOGLE_CLIENT_SECRET in .env.",
        )
    try:
        auth_url = service.get_auth_url()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return {"auth_url": auth_url}


@router.get("/callback")
async def calendar_callback(
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
    service: CalendarService = request.app.state.calendar
    try:
        await service.exchange_code(code, db)
    except Exception as e:
        return HTMLResponse(
            f'<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">'
            f"<p>Token exchange failed: {e}</p></body></html>",
            status_code=500,
        )
    return HTMLResponse(_AUTH_SUCCESS_HTML)


@router.get("/events")
async def get_calendar_events(
    request: Request,
    week_start: date | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    service: CalendarService = request.app.state.calendar
    if not service.is_authorized():
        return {"events": [], "authorized": False}
    ws = week_start or _this_monday()
    try:
        events = await service.get_week_events(ws, db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Calendar fetch failed: {e}",
        )
    return {"events": [e.to_dict() for e in events], "authorized": True}
