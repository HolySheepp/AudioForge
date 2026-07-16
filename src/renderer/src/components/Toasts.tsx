import { useApp } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  )
}
