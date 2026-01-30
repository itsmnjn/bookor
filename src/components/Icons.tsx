// Simple inline SVG icons to avoid dependencies

export function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 12L6 8l4-4" />
    </svg>
  )
}

export function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" />
    </svg>
  )
}

export function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 10V3M5 5l3-3 3 3M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
    </svg>
  )
}

export function FileIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
      <path d="M9 1v4h4" />
    </svg>
  )
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8l3 3 7-7" />
    </svg>
  )
}

export function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8a6 6 0 0110.47-4M14 8a6 6 0 01-10.47 4" />
      <path d="M12 1v3h-3M4 12v3h3" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M6 7v5M10 7v5" />
      <path d="M3 4l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10" />
    </svg>
  )
}

export function EyeOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2l12 12" />
      <path d="M6.5 6.5a2 2 0 002.8 2.8" />
      <path d="M4.2 4.2C2.8 5.2 1.5 6.5 1 8c1 3 3.5 5 7 5 1.2 0 2.3-.3 3.3-.7" />
      <path d="M8 3c3.5 0 6 2 7 5-.3.8-.8 1.6-1.4 2.3" />
    </svg>
  )
}

export function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M1 8c1-3 3.5-5 7-5s6 2 7 5c-1 3-3.5 5-7 5s-6-2-7-5z" />
    </svg>
  )
}
