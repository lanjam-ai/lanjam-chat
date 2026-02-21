import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  minDurationMs?: number;
}

export function LoadingOverlay({
  visible,
  message = "Loading...",
  minDurationMs = 1500,
}: LoadingOverlayProps) {
  const [show, setShow] = useState(false);
  const [rendered, setRendered] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      // Mount and fade in
      startTimeRef.current = Date.now();
      setRendered(true);
      // Trigger fade-in on next frame so the transition plays
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });
    } else if (rendered) {
      // Ensure minimum duration before fading out
      const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const remaining = Math.max(0, minDurationMs - elapsed);

      const timer = setTimeout(() => {
        setShow(false);
        // After fade-out transition completes, unmount
        setTimeout(() => setRendered(false), 300);
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [visible, minDurationMs, rendered]);

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/95 transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="w-full max-w-sm text-center space-y-6">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
