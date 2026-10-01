import type { RecorderState } from "../lib/useVoiceRecorder";

interface Props {
  state: RecorderState;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: "sm" | "lg";
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VoiceButton({ state, elapsed, onStart, onStop, disabled, size = "sm" }: Props) {
  const isLg = size === "lg";
  const base = isLg
    ? "flex items-center justify-center rounded-full transition-all focus:outline-none"
    : "flex items-center justify-center rounded-lg transition-all focus:outline-none";
  const dim = isLg ? "w-16 h-16" : "w-9 h-9";

  if (state === "transcribing") {
    return (
      <button
        type="button"
        disabled
        className={`${base} ${dim} bg-white/10 opacity-70`}
        title="Transcribing…"
      >
        <svg className="animate-spin" width={isLg ? 24 : 16} height={isLg ? 24 : 16} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  if (state === "recording") {
    return (
      <button
        type="button"
        onClick={onStop}
        className={`${base} ${dim} bg-red-500/20 ring-2 ring-red-500/60 hover:bg-red-500/30`}
        title="Stop recording"
      >
        <div className="flex flex-col items-center gap-0.5">
          <div className={`rounded-sm bg-red-400 ${isLg ? "w-5 h-5" : "w-3 h-3"}`} />
          {isLg && (
            <span className="text-[10px] text-red-300 tabular-nums">{formatElapsed(elapsed)}</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className={`${base} ${dim} bg-white/5 hover:bg-white/15 disabled:opacity-40`}
      title="Record voice message"
    >
      <svg width={isLg ? 24 : 16} height={isLg ? 24 : 16} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
        <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 11z" />
      </svg>
    </button>
  );
}
