'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, X } from 'lucide-react'

type AdminLoginDialogProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AdminLoginDialog({ open, onClose, onSuccess }: AdminLoginDialogProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPending(false)
    const focusTimer = setTimeout(() => usernameRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (response.ok) {
        setUsername('')
        setPassword('')
        onSuccess()
        return
      }
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(
        response.status === 429
          ? 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'
          : data?.error ?? 'Login gagal.',
      )
    } catch {
      setError('Tidak bisa menghubungi server.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="admin-login-title" className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d151d] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#b6e640]/15 text-[#b6e640]">
              <Lock size={17} />
            </div>
            <div>
              <h2 id="admin-login-title" className="text-sm font-bold">Mode Admin</h2>
              <p className="text-[11px] text-white/40">Masuk untuk mengedit skor pertandingan</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-white/40 transition hover:text-white">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40">
            Username
            <input
              ref={usernameRef}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#b6e640]/50"
            />
          </label>

          <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#b6e640]/50"
            />
          </label>

          {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#b6e640] py-2 text-xs font-black uppercase tracking-wider text-[#0b1118] transition disabled:opacity-60"
          >
            {pending ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
