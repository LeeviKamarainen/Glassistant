"""Spotify service: Authorization Code flow, token management, now-playing proxy."""
from __future__ import annotations

import base64
import sqlite3
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

SCOPES = "user-read-currently-playing user-read-playback-state"
_CACHE_TTL = 15  # seconds — short enough to feel live, long enough to be polite


@dataclass
class SpotifyTrack:
    title: str
    artist: str
    album: str
    album_art_url: str | None
    is_playing: bool
    progress_ms: int
    duration_ms: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "album_art_url": self.album_art_url,
            "is_playing": self.is_playing,
            "progress_ms": self.progress_ms,
            "duration_ms": self.duration_ms,
        }


class SpotifyService:
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._expires_at: float = 0.0
        self._http = httpx.AsyncClient(timeout=10.0)
        self._cache: tuple[float, SpotifyTrack | None] | None = None
        self._retry_after: float = 0.0  # epoch time after which requests may resume

    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    def is_authorized(self) -> bool:
        return self._refresh_token is not None

    def load_tokens(self, db: sqlite3.Connection) -> None:
        if not self.is_configured():
            return
        row = db.execute(
            "SELECT access_token, refresh_token, token_expiry FROM oauth_tokens WHERE provider = 'spotify'"
        ).fetchone()
        if row is None:
            return
        self._access_token = row["access_token"]
        self._refresh_token = row["refresh_token"]
        self._expires_at = float(row["token_expiry"] or 0.0)

    def _save_tokens(self, db: sqlite3.Connection) -> None:
        db.execute(
            """
            INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_expiry, scopes)
            VALUES ('spotify', ?, ?, ?, ?)
            ON CONFLICT(provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = COALESCE(excluded.refresh_token, refresh_token),
                token_expiry = excluded.token_expiry,
                scopes = excluded.scopes
            """,
            (self._access_token, self._refresh_token, self._expires_at, SCOPES),
        )

    def _basic_auth_header(self) -> str:
        raw = f"{self._client_id}:{self._client_secret}"
        return "Basic " + base64.b64encode(raw.encode()).decode()

    def get_auth_url(self) -> str:
        if not self.is_configured():
            raise ValueError("Spotify credentials not configured in .env")
        params = {
            "client_id": self._client_id,
            "response_type": "code",
            "redirect_uri": self._redirect_uri,
            "scope": SCOPES,
            "show_dialog": "true",
        }
        return "https://accounts.spotify.com/authorize?" + urlencode(params)

    async def exchange_code(self, code: str, db: sqlite3.Connection) -> None:
        resp = await self._http.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._redirect_uri,
            },
            headers={"Authorization": self._basic_auth_header()},
        )
        _raise_for_spotify_status(resp)
        data = resp.json()
        self._access_token = data["access_token"]
        self._refresh_token = data.get("refresh_token", self._refresh_token)
        self._expires_at = time.time() + data.get("expires_in", 3600) - 60
        self._cache = None
        self._save_tokens(db)

    async def _refresh_access_token(self, db: sqlite3.Connection) -> None:
        if not self._refresh_token:
            raise RuntimeError("No Spotify refresh token stored — re-authorize the app")
        resp = await self._http.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self._refresh_token,
            },
            headers={"Authorization": self._basic_auth_header()},
        )
        _raise_for_spotify_status(resp)
        data = resp.json()
        self._access_token = data["access_token"]
        if "refresh_token" in data:
            self._refresh_token = data["refresh_token"]
        self._expires_at = time.time() + data.get("expires_in", 3600) - 60
        self._save_tokens(db)

    async def get_now_playing(self, db: sqlite3.Connection) -> SpotifyTrack | None:
        if not self.is_authorized():
            return None

        now = time.time()

        # Respect rate-limit backoff
        if now < self._retry_after:
            if self._cache is not None:
                return self._cache[1]
            return None

        # Serve from cache if still fresh
        if self._cache is not None and (now - self._cache[0]) < _CACHE_TTL:
            return self._cache[1]

        # Refresh access token if expired
        if not self._access_token or now >= self._expires_at:
            await self._refresh_access_token(db)

        resp = await self._http.get(
            "https://api.spotify.com/v1/me/player/currently-playing",
            headers={"Authorization": f"Bearer {self._access_token}"},
            params={"additional_types": "track"},
        )

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "30"))
            self._retry_after = now + retry_after
            if self._cache is not None:
                return self._cache[1]
            return None

        if resp.status_code == 204:
            self._cache = (now, None)
            return None

        _raise_for_spotify_status(resp)
        data = resp.json()

        if not data or data.get("currently_playing_type") != "track":
            self._cache = (now, None)
            return None

        item = data.get("item") or {}
        artists = ", ".join(a["name"] for a in item.get("artists", []))
        images = item.get("album", {}).get("images", [])
        # Use smallest image (last in list — Spotify orders largest → smallest)
        album_art = images[-1]["url"] if images else None

        track = SpotifyTrack(
            title=item.get("name", "Unknown"),
            artist=artists,
            album=item.get("album", {}).get("name", ""),
            album_art_url=album_art,
            is_playing=data.get("is_playing", False),
            progress_ms=data.get("progress_ms") or 0,
            duration_ms=item.get("duration_ms") or 0,
        )
        self._cache = (now, track)
        return track

    async def aclose(self) -> None:
        await self._http.aclose()


def _raise_for_spotify_status(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    try:
        detail = resp.json().get("error", {}).get("message", resp.text)
    except Exception:
        detail = resp.text
    raise httpx.HTTPStatusError(
        f"Spotify API error {resp.status_code}: {detail}",
        request=resp.request,
        response=resp,
    )
