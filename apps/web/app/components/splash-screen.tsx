import { useEffect, useRef, useState } from "react";
import { LogoWithText } from "./logo.js";

interface ServiceStatus {
  database: boolean | null;
  minio: boolean | null;
  ollama: boolean | null;
  whisper: boolean | null;
}

interface SplashScreenProps {
  onComplete: () => void;
  minDurationMs?: number;
}

export function SplashScreen({ onComplete, minDurationMs = 2500 }: SplashScreenProps) {
  const [services, setServices] = useState<ServiceStatus>({
    database: null,
    minio: null,
    ollama: null,
    whisper: null,
  });
  const [fadeOut, setFadeOut] = useState(false);
  const healthDone = useRef(false);
  const timerDone = useRef(false);
  const completedRef = useRef(false);

  function tryComplete() {
    if (healthDone.current && timerDone.current && !completedRef.current) {
      completedRef.current = true;
      setFadeOut(true);
      setTimeout(onComplete, 500);
    }
  }

  useEffect(() => {
    // Min duration timer
    const timer = setTimeout(() => {
      timerDone.current = true;
      tryComplete();
    }, minDurationMs);

    // Health check
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setServices(data.services);
        healthDone.current = true;
        tryComplete();
      })
      .catch(() => {
        setServices({ database: false, minio: false, ollama: false, whisper: false });
        healthDone.current = true;
        tryComplete();
      });

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background: "linear-gradient(135deg, #0f0a1e 0%, #1a1035 40%, #0f172a 100%)",
      }}
    >
      {/* Logo */}
      <div className="splash-logo">
        <LogoWithText size={64} />
      </div>

      {/* Tagline */}
      <p className="splash-fade-in mt-4 text-sm tracking-wide text-violet-300/70">
        Your family AI assistant
      </p>

      {/* Service status indicators */}
      <div className="splash-fade-in-delayed mt-8 flex items-center gap-4">
        <ServiceDot label="Database" status={services.database} />
        <ServiceDot label="Storage" status={services.minio} />
        <ServiceDot label="Ollama" status={services.ollama} />
        <ServiceDot label="Whisper" status={services.whisper} />
      </div>

      {/* Shimmer bar */}
      <div className="splash-fade-in-delayed mt-10 h-0.5 w-48 overflow-hidden rounded-full bg-white/5">
        <div className="splash-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
      </div>
    </div>
  );
}

function ServiceDot({ label, status }: { label: string; status: boolean | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-2 w-2 rounded-full transition-colors duration-500 ${
          status === null ? "animate-pulse bg-white/20" : status ? "bg-emerald-400" : "bg-red-400"
        }`}
      />
      <span className="text-xs text-white/40">{label}</span>
    </div>
  );
}
