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

export function InfoIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 16);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" {...props}>
      <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
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

export function GroupIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="6" height="6" rx="1.2" />
      <rect x="14" y="13" width="6" height="6" rx="1.2" />
      <path d="M4 16v1.5A2.5 2.5 0 0 0 6.5 20H8" />
      <path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8" />
      <path d="M11 8h2M17 11v1M9 13v1" />
    </svg>
  );
}

export function UngroupIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="6" height="6" rx="1.2" />
      <rect x="14" y="13" width="6" height="6" rx="1.2" />
      <path d="M12 8h2.4M9.6 13.6 12 16M16 10.5V8M10 16h2.5" />
      <path d="m15.5 5.5 3-3M18.5 5.5l-3-3" />
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
export function CameraIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (

    <svg viewBox="0 -960 960 960" width={resolved} height={resolved} fill="currentColor" {...props}><path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H16₀v48₀Zm3₂₀-₂₄₀Z" /></svg>
  );
}

export function CameraOffIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg viewBox="0 -960 960 960" width={resolved} height={resolved} fill="currentColor" {...props}>
      <path d="m880-195-80-80v-405H638l-73-80H395l-38 42-57-57 60-65h240l74 80h126q33 0 56.5 23.5T880-680v485Zm-720 75q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h41l80 80H160v480h601l80 80H160Zm466-215q-25 34-62.5 54.5T480-260q-75 0-127.5-52.5T300-440q0-46 20.5-83.5T375-586l58 58q-24 13-38.5 36T380-440q0 42 29 71t71 29q29 0 52-14.5t36-38.5l58 58Zm-18-233q25 24 38.5 57t13.5 71v12q0 6-1 12L456-619q6-1 12-1h12q38 0 71 13.5t57 38.5ZM819-28 27-820l57-57L876-85l-57 57ZM407-440Zm171-57Z" />
    </svg>
  );
}

export function ObjectIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M440-183v-274L200-596v274l240 139Zm80 0 240-139v-274L520-457v274Zm-40-343 237-137-237-137-237 137 237 137ZM160-252q-19-11-29.5-29T120-321v-318q0-22 10.5-40t29.5-29l280-161q19-11 40-11t40 11l280 161q19 11 29.5 29t10.5 40v318q0 22-10.5 40T800-252L520-91q-19 11-40 11t-40-11L160-252Zm320-228Z" />
    </svg>
  );
}

export function AnimationIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M360-80q-58 0-109-22t-89-60q-38-38-60-89T80-360q0-81 42-148t110-102q20-39 49.5-68.5T350-728q33-68 101-110t149-42q58 0 109 22t89 60q38 38 60 89t22 109q0 85-42 150T728-350q-20 39-49.5 68.5T610-232q-35 68-102 110T360-80Zm0-80q33 0 63.5-10t56.5-30q-58 0-109-22t-89-60q-38-38-60-89t-22-109q-20 26-30 56.5T160-360q0 42 16 78t43 63q27 27 63 43t78 16Zm120-120q33 0 64.5-10t57.5-30q-59 0-110-22.5T403-403q-38-38-60.5-89T320-602q-20 26-30 57.5T280-480q0 42 15.5 78t43.5 63q27 28 63 43.5t78 15.5Zm120-120q18 0 34.5-3t33.5-9q22-60 6.5-115.5T621-621q-38-38-93.5-53.5T412-668q-6 17-9 33.5t-3 34.5q0 42 15.5 78t43.5 63q27 28 63 43.5t78 15.5Zm160-78q20-26 30-57.5t10-64.5q0-42-15.5-78T741-741q-27-28-63-43.5T600-800q-35 0-65.5 10T478-760q59 0 110 22.5t89 60.5q38 38 60.5 89T760-478ZM600-600Z" />
    </svg>
  );
}

export function EditorIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m352-522 86-87-56-57-44 44-56-56 43-44-45-45-87 87 159 158Zm328 329 87-87-45-45-44 43-56-56 43-44-57-56-86 86 158 159Zm24-567 57 57-57-57ZM290-120H120v-170l175-175L80-680l200-200 216 216 151-152q12-12 27-18t31-6q16 0 31 6t27 18l53 54q12 12 18 27t6 31q0 16-6 30.5T816-647L665-495l215 215L680-80 465-295 290-120Zm-90-80h56l392-391-57-57-391 392v56Zm420-419-29-29 57 57-28-28Z" />
    </svg>
  );
}

export function RuntimeIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-480H200v480Zm133.5-124.5Q269-369 240-440q29-71 93.5-115.5T480-600q82 0 146.5 44.5T720-440q-29 71-93.5 115.5T480-280q-82 0-146.5-44.5Zm248.5-42q46-26.5 72-73.5-26-47-72-73.5T480-540q-56 0-102 26.5T306-440q26 47 72 73.5T480-340q56 0 102-26.5ZM480-440Zm42.5 42.5Q540-415 540-440t-17.5-42.5Q505-500 480-500t-42.5 17.5Q420-465 420-440t17.5 42.5Q455-380 480-380t42.5-17.5Z" />
    </svg>
  );
}

export function WorldIcon({ size, ...props }: IconProps) {
  const resolved = resolveSize(size, 14);
  return (
    <svg width={resolved} height={resolved} viewBox="0 -960 960 960" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
<path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-7-.5-14.5T799-507q-5 29-27 48t-52 19h-80q-33 0-56.5-23.5T560-520v-40H400v-80q0-33 23.5-56.5T480-720h40q0-23 12.5-40.5T563-789q-20-5-40.5-8t-42.5-3q-134 0-227 93t-93 227h200q66 0 113 47t47 113v40H400v110q20 5 39.5 7.5T480-160Z"/>    </svg>
  );
}