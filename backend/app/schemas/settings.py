from __future__ import annotations

from pydantic import BaseModel, Field

# Keep in sync with the theme names defined in `frontend/src/lib/themes.ts`.
KNOWN_THEMES = {"mirror", "moonlight", "ember", "forest"}

# Keep in sync with EFFECT_STYLES in `frontend/src/lib/useEffectStyle.ts`.
KNOWN_EFFECT_STYLES = {"calm", "dynamic"}


class SettingsOut(BaseModel):
    settings: dict[str, str]


class SettingUpdate(BaseModel):
    value: str = Field(..., min_length=1, max_length=128)
