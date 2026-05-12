import { useEffect, useState } from "react";
import { dubhubVideoDebugEnabled } from "@/lib/video-debug";
import {
  getNativeCompressPassthrough,
  isNativeIosVideoEditorPath,
  setNativeCompressPassthrough,
} from "@/lib/native-video-editor";

/** Trim screen only — visible when `sessionStorage.dubhub_video_debug === '1'` on Capacitor iOS. */
export function TrimNativePassthroughToggle() {
  const gate = dubhubVideoDebugEnabled() && isNativeIosVideoEditorPath();
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!gate) return;
    let cancelled = false;
    void getNativeCompressPassthrough().then((r) => {
      if (cancelled) return;
      setOn(!!r.dubhub_native_compress_passthrough);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gate]);

  if (!gate || !hydrated) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.25rem,env(safe-area-inset-bottom,0px))] z-[85] flex justify-center pb-px">
      <button
        type="button"
        className="pointer-events-auto px-2 py-0.5 text-[10px] font-normal text-white/30 hover:text-white/50 [-webkit-tap-highlight-color:transparent]"
        onClick={() => {
          void (async () => {
            const next = !on;
            const r = await setNativeCompressPassthrough(next);
            setOn(!!r.dubhub_native_compress_passthrough);
          })();
        }}
      >
        Native passthrough: {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}
