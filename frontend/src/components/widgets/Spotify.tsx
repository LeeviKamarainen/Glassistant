import { useEffect, useState } from "react";

import { usePreview } from "../../lib/previewContext";
import { api } from "../../lib/api";
import type { SpotifyTrack } from "../../lib/types";
import type { WidgetProps } from "./registry";

const POLL_MS = 15_000;

const MOCK_TRACK: SpotifyTrack = {
  title: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  album_art_url: null,
  is_playing: true,
  progress_ms: 92_000,
  duration_ms: 354_000,
};

function fmtMs(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = String(totalS % 60).padStart(2, "0");
  return `${m}:${s}`;
}

interface State {
  track: SpotifyTrack | null;
  authorized: boolean;
}

export function Spotify({ widget: _widget }: WidgetProps) {
  const preview = usePreview();
  const [state, setState] = useState<State | null>(
    preview ? { track: MOCK_TRACK, authorized: true } : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let controller = new AbortController();

    async function load() {
      controller = new AbortController();
      try {
        const data = await api.getSpotifyNowPlaying(controller.signal);
        if (!cancelled) {
          setState({ track: data.track, authorized: data.authorized });
          setError(null);
        }
      } catch (e) {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      controller.abort();
    };
  }, [preview]);

  if (error) {
    return <div className="text-red-300/80 text-sm">spotify: {error}</div>;
  }

  if (!state) {
    return <div className="text-fg-faint text-sm">loading…</div>;
  }

  if (!state.authorized) {
    return (
      <div className="flex flex-col gap-1.5">
        <SpotifyLogo />
        <div className="text-fg-soft text-sm">Spotify not connected</div>
        <div
          className="text-fg-faint"
          style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.72rem)" }}
        >
          Visit /api/spotify/auth to authorize
        </div>
      </div>
    );
  }

  if (!state.track) {
    return (
      <div className="flex items-center gap-2">
        <SpotifyLogo />
        <div className="text-fg-faint text-sm">Nothing playing</div>
      </div>
    );
  }

  const { track } = state;
  const progress = track.duration_ms > 0
    ? Math.min(track.progress_ms / track.duration_ms, 1)
    : 0;

  return (
    <div className="anim-fade-in flex flex-col gap-2 w-full">
      {/* Album art + track info row */}
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 rounded overflow-hidden bg-white/10"
          style={{
            width: "clamp(2.5rem, 5vw, 4rem)",
            height: "clamp(2.5rem, 5vw, 4rem)",
          }}
        >
          {track.album_art_url ? (
            <img
              src={track.album_art_url}
              alt={track.album}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg-faint">
              <NoteIcon />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div
            className="text-fg font-medium truncate leading-snug"
            style={{ fontSize: "clamp(0.75rem, 1.3vw, 1.05rem)" }}
          >
            {track.title}
          </div>
          <div
            className="text-fg-soft truncate"
            style={{ fontSize: "clamp(0.65rem, 1.05vw, 0.85rem)" }}
          >
            {track.artist}
          </div>
          <div
            className="text-fg-faint truncate"
            style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.7rem)" }}
          >
            {track.album}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1">
        <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span
            className="text-fg-faint tabular-nums"
            style={{ fontSize: "clamp(0.5rem, 0.75vw, 0.65rem)" }}
          >
            {fmtMs(track.progress_ms)}
          </span>
          <span
            className="text-fg-faint tabular-nums"
            style={{ fontSize: "clamp(0.5rem, 0.75vw, 0.65rem)" }}
          >
            {fmtMs(track.duration_ms)}
          </span>
        </div>
      </div>

      {/* Spotify attribution */}
      <div className="flex items-center gap-1.5">
        <SpotifyLogo />
        {!track.is_playing && (
          <span
            className="text-fg-faint"
            style={{ fontSize: "clamp(0.5rem, 0.75vw, 0.65rem)" }}
          >
            Paused
          </span>
        )}
      </div>
    </div>
  );
}

function SpotifyLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0 text-[#1DB954]"
      style={{ width: "clamp(0.7rem, 1.1vw, 0.95rem)", height: "clamp(0.7rem, 1.1vw, 0.95rem)" }}
      aria-label="Spotify"
      role="img"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2 opacity-40">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}
