import axios from 'axios'

// Axios instance for logged-in requests: adds "Authorization: Bearer <token>" automatically
const api = axios.create({ baseURL: process.env.REACT_APP_BACKEND_SERVER_URI })

api.interceptors.request.use((config) => {
    const accessToken = localStorage.getItem('accessToken')
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
    return config
})

// Pulls the server's { message } out of a failed request
export const errorMessage = (error) => {
    if (error.response?.data?.message) return error.response.data.message
    if (!error.response) return "Couldn't reach the server. Is the backend running?"
    // A 404 without a message means the backend doesn't have this route, usually because it's running old code
    if (error.response.status === 404) return 'The server doesn\'t recognize this request. Try restarting the backend.'
    return 'Something went wrong. Please try again.'
}

export default api
