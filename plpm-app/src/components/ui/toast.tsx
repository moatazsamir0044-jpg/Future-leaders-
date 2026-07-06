'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error'
interface Toast { id: number; message: string; variant: ToastVariant }

const ToastContext = createContext<(message: string, variant?: ToastVariant) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++idRef.current
    setToasts(t => [...t, { id, message, variant }])
    setTimeout(() => dismiss(id), variant === 'error' ? 8000 : 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg bg-white',
              t.variant === 'success' ? 'border-green-200' : 'border-red-200',
            )}
          >
            {t.variant === 'success'
              ? <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />}
            <span className="flex-1 text-gray-800">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
