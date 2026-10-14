// Due dates are stored as one moment in time (ISO string) and shown in the viewer's own time zone

// "Mon, Oct 20, 11:59 PM"
export const formatDue = (iso) => new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

export const isPastDue = (iso) => !!iso && new Date(iso) <= new Date()

const pad = (n) => String(n).padStart(2, '0')

// ISO string -> values for <input type="date"> and <input type="time">
export const toDueInputs = (iso) => {
    if (!iso) return { date: '', time: '' }
    const d = new Date(iso)
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    }
}

// Date and time inputs -> ISO string, or null when no date is picked. No time means the end of that day.
export const fromDueInputs = (date, time) => (date ? new Date(`${date}T${time || '23:59'}`).toISOString() : null)
