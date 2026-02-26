import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react'
import axios, { type CancelTokenSource } from 'axios'

/* ─────────────────── Constants ─────────────────── */

const ACCEPTED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const SSE_INACTIVITY_TIMEOUT_MS = 60_000 // 60 seconds

/** Emoji or text codes the backend may send to signal the stream is done */
const DONE_STATUSES = new Set(['🏁', 'completed', 'done'])
const ERROR_STATUSES = new Set(['❌', 'error'])

/* ─────────────────── Types ─────────────────── */

export type UploadStatus = 'idle' | 'selected' | 'uploading' | 'processing' | 'success' | 'error'

export interface StatusInfo {
    status: UploadStatus
    step: string
    detail: string
}

/* ─────────────────── Config ─────────────────── */

const API_BASE = 'http://localhost:8000'
const API_ENDPOINT = `${API_BASE}/upload`

/* ─────────────────── Component ─────────────────── */

interface Props {
    onStatusChange?: (info: StatusInfo) => void
}

export default function ResumeUploader({ onStatusChange }: Props) {
    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<UploadStatus>('idle')
    const [progress, setProgress] = useState(0)
    const [errorMsg, setErrorMsg] = useState('')
    const [isDragOver, setIsDragOver] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)
    const cancelRef = useRef<CancelTokenSource | null>(null)
    const sseRef = useRef<EventSource | null>(null)
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /* ── Helpers ── */

    const emit = useCallback(
        (s: UploadStatus, step = '', detail = '') =>
            onStatusChange?.({ status: s, step, detail }),
        [onStatusChange],
    )

    const formatSize = (bytes: number) =>
        bytes < 1024 * 1024
            ? `${(bytes / 1024).toFixed(1)} KB`
            : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

    const fileIcon = (name: string) => {
        if (name.endsWith('.pdf')) return '📄'
        if (name.endsWith('.doc') || name.endsWith('.docx')) return '📝'
        return '📎'
    }

    const clearInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current)
            inactivityTimerRef.current = null
        }
    }, [])

    const restartInactivityTimer = useCallback((source: EventSource) => {
        clearInactivityTimer()
        inactivityTimerRef.current = setTimeout(() => {
            source.close()
            sseRef.current = null
            setStatus((prev) => {
                if (prev !== 'processing') return prev
                const message = 'Processing timed out due to inactivity.'
                setErrorMsg(message)
                emit('error', '', message)
                return 'error'
            })
        }, SSE_INACTIVITY_TIMEOUT_MS)
    }, [clearInactivityTimer, emit])

    /* ── Cleanup on unmount ── */
    useEffect(() => () => {
        sseRef.current?.close()
        clearInactivityTimer()
    }, [clearInactivityTimer])

    /* ── Validation ── */

    const validateFile = (f: File): string | null => {
        if (!ACCEPTED_TYPES.includes(f.type as typeof ACCEPTED_TYPES[number])) {
            return 'Please upload a PDF, DOC, or DOCX file.'
        }
        if (f.size > MAX_FILE_SIZE) return 'File size must be under 10 MB.'
        return null
    }

    const handleFile = useCallback((f: File) => {
        const err = validateFile(f)
        if (err) {
            setErrorMsg(err)
            setStatus('error')
            setFile(null)
            emit('error', '', err)
            return
        }
        setFile(f)
        setStatus('selected')
        setErrorMsg('')
        setProgress(0)
        emit('selected')
    }, [emit])

    /* ── SSE ── */

    const connectSSE = useCallback((taskId: string) => {
        const source = new EventSource(`${API_BASE}/status/${taskId}`)
        sseRef.current = source
        restartInactivityTimer(source)

        source.addEventListener('status', (e: MessageEvent) => {
            try {
                const { status: code, step = '', detail = '' } = JSON.parse(e.data)

                if (DONE_STATUSES.has(code) || DONE_STATUSES.has(step)) {
                    clearInactivityTimer()
                    source.close()
                    sseRef.current = null
                    setStatus('success')
                    emit('success', step || 'Done', detail)
                } else if (ERROR_STATUSES.has(code)) {
                    clearInactivityTimer()
                    source.close()
                    sseRef.current = null
                    setErrorMsg(detail || 'Processing failed.')
                    setStatus('error')
                    emit('error', step, detail || 'Processing failed.')
                } else {
                    restartInactivityTimer(source)
                    emit('processing', step, detail)
                }
            } catch { /* malformed event — skip */ }
        })

        source.onerror = () => {
            clearInactivityTimer()
            source.close()
            sseRef.current = null
            // Delay check: onerror fires when the server closes the stream *after*
            // sending the final event — give the queued 'status' event time to land.
            setTimeout(() => {
                setStatus((prev) => {
                    if (prev !== 'processing') return prev
                    setErrorMsg('Lost connection to server.')
                    emit('error', '', 'Lost connection to server.')
                    return 'error'
                })
            }, 500)
        }
    }, [clearInactivityTimer, emit, restartInactivityTimer])

    /* ── Upload ── */

    const uploadFile = async () => {
        if (!file) return
        setStatus('uploading')
        setProgress(0)
        emit('uploading')

        const formData = new FormData()
        formData.append('resume', file)
        const source = axios.CancelToken.source()
        cancelRef.current = source

        try {
            const { data } = await axios.post(API_ENDPOINT, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                cancelToken: source.token,
                onUploadProgress: (e) => {
                    setProgress(Math.round((e.loaded * 100) / (e.total ?? 1)))
                },
            })

            if (data.task_id) {
                setStatus('processing')
                emit('processing', 'Initializing...', '')
                connectSSE(data.task_id)
            } else {
                setStatus('success')
                setProgress(100)
                emit('success')
            }
        } catch (err) {
            if (axios.isCancel(err)) return
            const message = axios.isAxiosError(err)
                ? err.response?.data?.message ?? err.message
                : 'Upload failed. Please try again.'
            setErrorMsg(message)
            setStatus('error')
            emit('error', '', message)
        } finally {
            cancelRef.current = null
        }
    }

    const reset = () => {
        cancelRef.current?.cancel('Upload cancelled')
        sseRef.current?.close()
        sseRef.current = null
        clearInactivityTimer()
        setFile(null)
        setStatus('idle')
        setProgress(0)
        setErrorMsg('')
        emit('idle')
    }

    /* ── Drag events ── */
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragOver(true) }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragOver(false) }
    const onDrop = (e: DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) handleFile(f)
    }

    const onBrowse = () => inputRef.current?.click()
    const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
        e.target.value = ''
    }

    /* ── Render ── */

    const showPreview = file && status !== 'idle'

    return (
        <div className="w-full max-w-xl mx-auto">
            {/* ── Drop Zone ── */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={onBrowse}
                className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-10
          transition-all duration-300 ease-in-out group
          ${isDragOver
                        ? 'border-gray-900 bg-gray-50 scale-[1.02] shadow-lg shadow-gray-300/50'
                        : 'border-gray-300 bg-white/50 hover:border-gray-400 hover:bg-gray-50/60 hover:shadow-md hover:shadow-gray-200/40'
                    }
        `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={onInputChange}
                    className="hidden"
                />

                <div className="flex flex-col items-center gap-4">
                    <div className={`
            w-16 h-16 rounded-2xl flex items-center justify-center
            transition-all duration-300
            ${isDragOver
                            ? 'bg-gray-900 scale-110 rotate-3'
                            : 'bg-gradient-to-br from-gray-100 to-gray-200 group-hover:scale-105 group-hover:-rotate-2'
                        }
          `}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`w-8 h-8 transition-colors duration-300 ${isDragOver ? 'text-white' : 'text-gray-600'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                        </svg>
                    </div>

                    <div className="text-center">
                        <p className="text-lg font-semibold text-gray-800">
                            {isDragOver ? 'Drop your resume here' : 'Drag & drop your resume'}
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                            or <span className="text-gray-700 font-medium underline underline-offset-2 decoration-gray-300 hover:decoration-gray-500 transition-colors">browse files</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                        {['PDF', 'DOC', 'DOCX'].map((ext) => (
                            <span key={ext} className="px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                {ext}
                            </span>
                        ))}
                        <span className="text-[11px] text-gray-400">Max 10 MB</span>
                    </div>
                </div>
            </div>

            {/* ── File Card ── */}
            {showPreview && (
                <div className={`
          mt-5 rounded-xl border px-5 py-4 transition-all duration-500 ease-out
          animate-[slideUp_0.35s_ease-out]
          ${status === 'error' ? 'border-red-200 bg-red-50/50'
                        : status === 'success' ? 'border-green-300 bg-green-50/50'
                            : 'border-gray-200 bg-white/60'}
        `}>
                    <div className="flex items-center gap-4">
                        <span className="text-3xl">{fileIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatSize(file.size)}</p>
                        </div>

                        {status === 'selected' && (
                            <button
                                onClick={(e) => { e.stopPropagation(); reset() }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}

                        {status === 'success' && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                <span className="text-xs font-semibold">Completed</span>
                            </div>
                        )}
                    </div>

                    {/* Upload progress */}
                    {status === 'uploading' && (
                        <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-gray-700 to-gray-900 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5 text-right font-medium">{progress}%</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Error ── */}
            {status === 'error' && (
                <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50/80 border border-red-200 animate-[slideUp_0.25s_ease-out]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-red-600">{errorMsg}</p>
                </div>
            )}

            {/* ── Actions ── */}
            <div className="mt-6 flex gap-3">
                {status === 'selected' && (
                    <>
                        <button
                            onClick={uploadFile}
                            className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-gray-900 hover:bg-gray-800 active:scale-[0.98] shadow-md shadow-gray-300/50 hover:shadow-lg hover:shadow-gray-400/40 transition-all duration-200"
                        >
                            Upload Resume
                        </button>
                        <button
                            onClick={reset}
                            className="px-5 py-3 rounded-xl font-medium text-sm text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 active:scale-[0.98] transition-all duration-200"
                        >
                            Cancel
                        </button>
                    </>
                )}

                {(status === 'success' || status === 'error') && (
                    <button
                        onClick={reset}
                        className="flex-1 py-3 rounded-xl font-semibold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98] transition-all duration-200"
                    >
                        Upload Another
                    </button>
                )}
            </div>
        </div>
    )
}
