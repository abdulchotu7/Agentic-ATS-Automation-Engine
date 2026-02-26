import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const buildApiUrl = (path: string) => {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

export interface UploadResponse {
  task_id?: string
}

export const uploadResume = async (
  formData: FormData,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) => {
  const response = await axios.post<UploadResponse>(buildApiUrl('/upload'), formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      const total = event.total ?? 1
      onProgress(Math.round((event.loaded * 100) / total))
    },
    signal,
  })

  return response.data
}

export const openStatusStream = (taskId: string) =>
  new EventSource(buildApiUrl(`/status/${taskId}`))
