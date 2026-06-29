import { useState, useEffect } from 'react'

export default function PWAInstallPrompt() {
  const [show, setShow]         = useState(false)
  const [isIOS, setIsIOS]       = useState(false)
  const [deferredPrompt, setDP] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Check already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem('pwa-dismissed')) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    setIsIOS(ios)

    // iOS - show manual instructions after 3s
    if (ios && isSafari) {
      setTimeout(() => setShow(true), 3000)
      return
    }

    // Android/Desktop - capture beforeinstallprompt
    const handler = e => {
      e.preventDefault()
      setDP(e)
      setTimeout(() => setShow(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setShow(false); setInstalled(true) })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('pwa-dismissed', '1')
  }

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDP(null)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9999,
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      maxWidth: 420, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <img src="/sitc-portal/pwa-192x192.png" alt="App icon"
          style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
            Install Project Tracker
          </div>
          {isIOS ? (
            <div style={{ fontSize: 12, color: 'var(--text-s)', lineHeight: 1.6 }}>
              Tap the <strong>Share</strong> button
              <span style={{ display: 'inline-block', background: '#007AFF', color: '#fff', borderRadius: 4, padding: '0 4px', margin: '0 3px', fontSize: 11 }}>⬆</span>
              in Safari, then tap <strong>"Add to Home Screen"</strong> to install this app.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-s)' }}>
              Install for quick access — works offline, home screen icon, no browser needed.
            </div>
          )}
        </div>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-s)', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0
        }}>×</button>
      </div>
      {!isIOS && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={install}>
            Install app
          </button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={dismiss}>
            Not now
          </button>
        </div>
      )}
      {isIOS && (
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={dismiss}>
          Got it
        </button>
      )}
    </div>
  )
}
