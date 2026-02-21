interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 64, className = "" }: LogoProps) {
  const scale = size / 64;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="logo-accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      {/* Chat bubble body */}
      <rect x="6" y="8" width="52" height="38" rx="12" fill="url(#logo-gradient)" />
      {/* Chat bubble tail */}
      <path d="M14 46L10 56L24 46" fill="url(#logo-gradient)" />
      {/* Three dots - typing indicator */}
      <circle cx="22" cy="27" r="3.5" fill="white" opacity="0.9" />
      <circle cx="32" cy="27" r="3.5" fill="white" opacity="0.7" />
      <circle cx="42" cy="27" r="3.5" fill="white" opacity="0.5" />
    </svg>
  );
}

export function LogoWithText({ size = 48, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo size={size} />
      <div className="flex items-baseline gap-0.5">
        <span
          className="font-light tracking-wide"
          style={{ fontSize: size * 0.55, color: "#c4b5fd" }}
        >
          Lan
        </span>
        <span
          className="font-bold tracking-tight"
          style={{ fontSize: size * 0.65, color: "white" }}
        >
          JAM
        </span>
      </div>
    </div>
  );
}
