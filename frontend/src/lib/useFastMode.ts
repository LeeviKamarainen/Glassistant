import { useState } from "react";

const KEY = "glassistant.fastMode";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Per-device toggle for the Needle fast path; remembered in localStorage. */
export function useFastMode(): [boolean, (v: boolean) => void] {
  const [fast, setFastState] = useState(read);
  function setFast(v: boolean) {
    setFastState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable — toggle still works for this session */
    }
  }
  return [fast, setFast];
}
