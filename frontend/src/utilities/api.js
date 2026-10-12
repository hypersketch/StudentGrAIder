import axios from 'axios'

// Axios instance for logged-in requests: adds "Authorization: Bearer <token>" automatically
const api = axios.create({ baseURL: process.env.REACT_APP_BACKEND_SERVER_URI })

api.interceptors.request.use((config) => {
    const accessToken = localStorage.getItem('accessToken')
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
    return config
})

// Pulls the server's { message } out of a failed request
export const errorMessage = (error) =>
    error.response?.data?.message || 'Something went wrong. Please try again.'

export default api
