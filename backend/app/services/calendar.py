"""Google Calendar service: OAuth 2.0 authorization and event fetching with TTL cache."""
from __future__ import annotations

import asyncio
import sqlite3
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any


SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
_CACHE_TTL = 300  # 5 minutes


@dataclass
class CalendarEvent:
    id: str
    summary: str
    start: str
    end: str
    all_day: bool
    color: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "summary": self.summary,
            "start": self.start,
            "end": self.end,
            "all_day": self.all_day,
            "color": self.color,
        }


class CalendarService:
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._credentials: Any | None = None  # google.oauth2.credentials.Credentials
        self._cache: dict[str, tuple[float, list[CalendarEvent]]] = {}

    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    def is_authorized(self) -> bool:
        return self._credentials is not None

    def _client_config(self) -> dict[str, Any]:
        return {
            "web": {
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [self._redirect_uri],
            }
        }

    def load_tokens(self, db: sqlite3.Connection) -> None:
        """Load stored OAuth tokens from the database on startup."""
        if not self.is_configured():
            return
        try:
            from google.oauth2.credentials import Credentials
        except ImportError:
            return
        row = db.execute(
            "SELECT access_token, refresh_token, token_expiry, scopes FROM oauth_tokens WHERE provider = 'google'"
        ).fetchone()
        if row is None:
            return
        creds = Credentials(
            token=row["access_token"],
            refresh_token=row["refresh_token"],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self._client_id,
            client_secret=self._client_secret,
            scopes=row["scopes"].split(" ") if row["scopes"] else SCOPES,
        )
        if row["token_expiry"]:
            creds.expiry = datetime.fromtimestamp(row["token_expiry"], tz=timezone.utc)
        self._credentials = creds

    def _save_tokens(self, db: sqlite3.Connection) -> None:
        if self._credentials is None:
            return
        expiry = (
            self._credentials.expiry.timestamp()
            if self._credentials.expiry
            else None
        )
        scopes = " ".join(self._credentials.scopes or SCOPES)
        db.execute(
            """
            INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_expiry, scopes)
            VALUES ('google', ?, ?, ?, ?)
            ON CONFLICT(provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = COALESCE(excluded.refresh_token, refresh_token),
                token_expiry = excluded.token_expiry,
                scopes = excluded.scopes
            """,
            (self._credentials.token, self._credentials.refresh_token, expiry, scopes),
        )

    def get_auth_url(self) -> str:
        if not self.is_configured():
            raise ValueError("Google OAuth credentials not configured in .env")
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_config(
            self._client_config(),
            scopes=SCOPES,
            redirect_uri=self._redirect_uri,
        )
        auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
        return auth_url

    async def exchange_code(self, code: str, db: sqlite3.Connection) -> None:
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_config(
            self._client_config(),
            scopes=SCOPES,
            redirect_uri=self._redirect_uri,
        )
        await asyncio.to_thread(flow.fetch_token, code=code)
        self._credentials = flow.credentials
        self._save_tokens(db)
        self._cache.clear()

    async def get_week_events(
        self, week_start: date, db: sqlite3.Connection
    ) -> list[CalendarEvent]:
        key = week_start.isoformat()
        now = time.time()
        cached = self._cache.get(key)
        if cached is not None and (now - cached[0]) < _CACHE_TTL:
            return cached[1]
        events = await self._fetch_events(week_start, db)
        self._cache[key] = (now, events)
        return events

    async def _fetch_events(
        self, week_start: date, db: sqlite3.Connection
    ) -> list[CalendarEvent]:
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        creds = self._credentials
        if creds is None:
            return []

        if creds.expired and creds.refresh_token:
            await asyncio.to_thread(creds.refresh, Request())
            self._save_tokens(db)

        week_end = week_start + timedelta(days=7)
        time_min = datetime(
            week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc
        ).isoformat()
        time_max = datetime(
            week_end.year, week_end.month, week_end.day, tzinfo=timezone.utc
        ).isoformat()

        def _call_api() -> dict[str, Any]:
            service = build("calendar", "v3", credentials=creds, cache_discovery=False)
            return (
                service.events()
                .list(
                    calendarId="primary",
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy="startTime",
                    maxResults=100,
                )
                .execute()
            )

        result = await asyncio.to_thread(_call_api)

        events: list[CalendarEvent] = []
        for item in result.get("items", []):
            start = item.get("start", {})
            end = item.get("end", {})
            all_day = "date" in start and "dateTime" not in start
            events.append(
                CalendarEvent(
                    id=item.get("id", ""),
                    summary=item.get("summary", "(no title)"),
                    start=start.get("date") or start.get("dateTime", ""),
                    end=end.get("date") or end.get("dateTime", ""),
                    all_day=all_day,
                    color=item.get("colorId"),
                )
            )
        return events

    async def aclose(self) -> None:
        pass
