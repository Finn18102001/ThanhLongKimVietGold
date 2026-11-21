/**
 * USB-KBW (keyboard wedge) barcode listener for desk scanners.
 * Detects rapid key bursts ending with Enter; ignores slow human typing.
 * Generic only — no POS/purchase business rules here.
 */

export { normalizeLabelCode } from "./label-code";

export type BarcodeWedgeSubscribeOptions = {
  onScan: (code: string) => void;
  /** When false, listener ignores events. Default true. */
  enabled?: boolean;
  /** Max gap between chars to stay in a scan burst (ms). Default 55. */
  interKeyMs?: number;
  /** Minimum code length to accept. Default 3. */
  minLength?: number;
  /** Idle clear of partial buffer (ms). Default 120. */
  idleResetMs?: number;
  /** Return true to skip this event (modals, etc.). */
  shouldIgnore?: (event: KeyboardEvent) => boolean;
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Subscribe to window capture keydown. Returns unsubscribe.
 * From the 2nd rapid char onward, prevents default so wedges do not corrupt focused fields.
 */
export function subscribeBarcodeWedge(options: BarcodeWedgeSubscribeOptions): () => void {
  const interKeyMs = options.interKeyMs ?? 55;
  const minLength = options.minLength ?? 3;
  const idleResetMs = options.idleResetMs ?? 120;

  let buffer = "";
  let lastAt = 0;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function reset() {
    buffer = "";
    lastAt = 0;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(reset, idleResetMs);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (options.enabled === false) return;
    if (event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (options.shouldIgnore?.(event)) return;

    // Never hijack textarea / select / contenteditable (notes, etc.).
    if (isTextEntryTarget(event.target)) {
      reset();
      return;
    }

    if (event.key === "Enter") {
      if (buffer.length >= minLength) {
        event.preventDefault();
        event.stopPropagation();
        const code = buffer;
        reset();
        options.onScan(code);
      } else {
        reset();
      }
      return;
    }

    if (event.key === "Escape") {
      reset();
      return;
    }

    // Printable char only (wedge sends digits/letters/symbols one key at a time).
    if (event.key.length !== 1) return;

    const now = Date.now();
    if (lastAt > 0 && now - lastAt <= interKeyMs) {
      buffer += event.key;
      lastAt = now;
      event.preventDefault();
      event.stopPropagation();
      armIdle();
      return;
    }

    // Slow gap or first char: start a new candidate buffer; allow default (may be human).
    buffer = event.key;
    lastAt = now;
    armIdle();
  }

  window.addEventListener("keydown", onKeyDown, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    reset();
  };
}
