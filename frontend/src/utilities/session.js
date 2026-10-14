import jwt_decode from 'jwt-decode'
import api from './api'

// Logins last an hour. While someone is using the site (or has a quiz open), swap their login for a fresh one
// before it runs out, so a long quiz doesn't end in "please log in again". Someone who walks away still gets logged out.
const CHECK_EVERY_MS = 60 * 1000
const REFRESH_WHEN_LEFT_MS = 10 * 60 * 1000
const ACTIVE_WITHIN_MS = 15 * 60 * 1000

let lastActivity = Date.now()
let holds = 0

// Pages that must stay logged in even without mouse or keyboard activity, like a quiz in progress.
// Returns a function that releases the hold.
export const holdSession = () => {
    holds += 1
    return () => { holds -= 1 }
}

const refreshIfNeeded = async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    let expiresAt
    try { expiresAt = jwt_decode(token).exp * 1000 } catch { return }

    const left = expiresAt - Date.now()
    if (left <= 0 || left > REFRESH_WHEN_LEFT_MS) return
    if (!holds && Date.now() - lastActivity > ACTIVE_WITHIN_MS) return

    try {
        const { data } = await api.post('/user/refresh-token')
        localStorage.setItem('accessToken', data.accessToken)
    } catch {
        // Expired or deleted account: they'll be asked to log in on their next request
    }
}

// Starts watching for activity and refreshing the login. Returns a function that stops it.
export const startSessionKeepAlive = () => {
    const markActive = () => { lastActivity = Date.now() }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }))
    // Browsers slow down timers in background tabs, so also check when the tab comes back
    const onVisible = () => { if (document.visibilityState === 'visible') refreshIfNeeded() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(refreshIfNeeded, CHECK_EVERY_MS)

    return () => {
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
        events.forEach((e) => window.removeEventListener(e, markActive))
    }
}
