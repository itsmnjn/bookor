interface ProgressBarProps {
  translated: number
  reviewed: number
  total: number
  className?: string
}

export function ProgressBar({ translated, reviewed, total, className = "" }: ProgressBarProps) {
  const translatedPercent = total > 0 ? ((translated + reviewed) / total) * 100 : 0
  const reviewedPercent = total > 0 ? (reviewed / total) * 100 : 0

  return (
    <div className={`progress-bar ${className}`}>
      <div
        className="progress-bar__fill progress-bar__fill--translated"
        style={{ width: `${translatedPercent}%` }}
      />
      <div
        className="progress-bar__fill progress-bar__fill--reviewed"
        style={{ width: `${reviewedPercent}%` }}
      />
    </div>
  )
}
