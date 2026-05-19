from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GLASSISTANT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    db_path: Path = Path("./glassistant.db")

    default_weather_lat: float = 60.1699
    default_weather_lon: float = 24.9384

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    weather_cache_ttl_seconds: int = 600

    # HSL Digitransit routing API key. Leave empty to disable the transit proxy.
    digitransit_api_key: str = ""

    # Home coordinates, used by the transit widget as the default "Home" origin.
    # Set in .env so they are never committed to git.
    home_lat: float = 0.0
    home_lon: float = 0.0

    # Google Calendar OAuth 2.0 credentials. Register at https://console.cloud.google.com
    # and create an OAuth 2.0 web application credential.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/calendar/callback"

    # Spotify OAuth 2.0 credentials. Register at https://developer.spotify.com/dashboard
    # and add http://127.0.0.1:8000/api/spotify/callback as a Redirect URI.
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://127.0.0.1:8000/api/spotify/callback"


def get_settings() -> Settings:
    return Settings()
