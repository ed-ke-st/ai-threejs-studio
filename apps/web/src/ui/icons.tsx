import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function resolveSize(size: number | undefined, fallback: number): number {
  return size ?? fallback;
}

export function SettingsIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" />
    </svg>
  );
}

export function CloseIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function KebabIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

export function RestartIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 15);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v8" />
      <path d="M7.5 6.3a7 7 0 109 0" />
    </svg>
  );
}

export function RefreshIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 15);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

export function ShareIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 15);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.1 10.8l7.8-4.6M8.1 13.2l7.8 4.6" />
    </svg>
  );
}

export function DownloadIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 15);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  );
}

export function ChevronDownIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 12);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StyleIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 13);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="10" y="10" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function MoodIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 13);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2.4" fill="currentColor" />
      <circle cx="15" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function ExamplesIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 13);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    </svg>
  );
}

export function SetupIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TransformIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v18M3 12h18" />
      <path d="m12 3 2.5 2.5M12 3 9.5 5.5M21 12l-2.5 2.5M21 12l-2.5-2.5M12 21l2.5-2.5M12 21l-2.5-2.5M3 12l2.5 2.5M3 12l2.5-2.5" />
    </svg>
  );
}

export function MaterialIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3c3.5 4.2 5.3 7 5.3 9.1A5.3 5.3 0 1 1 6.7 12c0-2.1 1.8-4.9 5.3-9.1Z" />
      <path d="M9.2 15.4c.8.7 1.7 1 2.8 1" />
    </svg>
  );
}

export function TextureIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 12h16M12 4v16" />
      <path d="M4 8h8M12 16h8" opacity="0.8" />
    </svg>
  );
}

export function LightIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8.5 14.5c-1-1-1.5-2.3-1.5-3.8a5 5 0 1 1 10 0c0 1.5-.5 2.8-1.5 3.8-.8.8-1.3 1.6-1.5 2.5h-4c-.2-.9-.7-1.7-1.5-2.5Z" />
    </svg>
  );
}

export function MoveIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4v16M4 12h16" />
      <path d="m12 4 2.5 2.5M12 4 9.5 6.5M12 20l2.5-2.5M12 20l-2.5-2.5M4 12l2.5 2.5M4 12l2.5-2.5M20 12l-2.5 2.5M20 12l-2.5-2.5" />
    </svg>
  );
}

export function RotateIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function ScaleIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 8 4 4M16 8l4-4M8 16l-4 4M16 16l4 4" />
      <path d="M9 5H4v5M15 5h5v5M9 19H4v-5M15 19h5v-5" />
    </svg>
  );
}

export function UndoIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg viewBox="0 -960 960 960" width={resolved} height={resolved} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z" />
    </svg>
  );
}

export function RedoIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg viewBox="0 -960 960 960" width={resolved} height={resolved} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z" />
    </svg>
  );
}
