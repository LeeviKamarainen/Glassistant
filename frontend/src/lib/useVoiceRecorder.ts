import { useRef, useState } from "react";
import { api } from "./api";

export type RecorderState = "idle" | "recording" | "transcribing";

interface Options {
  onTranscript: (text: string) => void;
  onError: (msg: string) => void;
}

// Encode an AudioBuffer (mono, any sample rate) as a 16kHz mono PCM WAV Blob.
async function toWav16k(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const targetRate = 16_000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetRate),
    targetRate,
  );
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  // Mix down to mono by summing all channels equally
  const merger = offlineCtx.createChannelMerger(1);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const splitter = offlineCtx.createChannelSplitter(decoded.numberOfChannels);
    src.connect(splitter);
    splitter.connect(merger, ch, 0);
  }
  merger.connect(offlineCtx.destination);
  src.start();
  const resampled = await offlineCtx.startRendering();

  return encodeWav(resampled);
}

function encodeWav(buf: AudioBuffer): Blob {
  const samples = buf.getChannelData(0);
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataLen = int16.byteLength;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);       // chunk size
  v.setUint16(20, 1, true);        // PCM
  v.setUint16(22, 1, true);        // mono
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);        // block align
  v.setUint16(34, 16, true);       // bits per sample
  str(36, "data");
  v.setUint32(40, dataLen, true);

  return new Blob([header, int16.buffer], { type: "audio/wav" });
}

export function useVoiceRecorder({ onTranscript, onError }: Options) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setElapsed(0);
      setState("recording");
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Microphone access denied");
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder || state !== "recording") return;
    if (timerRef.current) clearInterval(timerRef.current);

    const mimeType = recorder.mimeType || "audio/webm";
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });

    setState("transcribing");
    const raw = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    recorderRef.current = null;

    try {
      const wav = await toWav16k(raw);
      const transcript = await api.transcribe(wav, "audio/wav");
      setState("idle");
      if (transcript.trim()) onTranscript(transcript.trim());
      else onError("No speech detected");
    } catch (e) {
      setState("idle");
      onError(e instanceof Error ? e.message : "Transcription failed");
    }
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (timerRef.current) clearInterval(timerRef.current);
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    setState("idle");
  }

  return { state, elapsed, start, stop, cancel };
}
