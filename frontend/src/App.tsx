import { useCallback, useState } from 'react'
import ResumeUploader, { type StatusInfo, type UploadStatus } from './components/ResumeUploader'

/* ─────────────────── Status bar theme ─────────────────── */

interface BadgeTheme {
  dot: string
  bg: string
  border: string
  text: string
  label: string
  ping?: boolean
}

const BADGE_THEME: Record<UploadStatus, BadgeTheme> = {
  idle: { dot: 'bg-green-400', bg: 'bg-white/80', border: 'border-gray-200', text: 'text-gray-500', label: 'Ready to upload', ping: true },
  selected: { dot: 'bg-blue-400', bg: 'bg-blue-50/80', border: 'border-blue-200', text: 'text-blue-600', label: 'File selected' },
  uploading: { dot: 'bg-amber-400', bg: 'bg-amber-50/80', border: 'border-amber-200', text: 'text-amber-600', label: 'Uploading...', ping: true },
  processing: { dot: 'bg-white', bg: 'bg-gray-900', border: 'border-gray-700', text: 'text-gray-100', label: 'Processing', ping: true },
  success: { dot: 'bg-green-400', bg: 'bg-green-50/80', border: 'border-green-300', text: 'text-green-700', label: 'Completed' },
  error: { dot: 'bg-red-400', bg: 'bg-red-50/80', border: 'border-red-200', text: 'text-red-600', label: 'Error' },
}

/* ─────────────────── Status Icon ─────────────────── */

function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === 'success') return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
  if (status === 'error') return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  )
  return null
}

/* ─────────────────── App ─────────────────── */

export default function App() {
  const [info, setInfo] = useState<StatusInfo>({ status: 'idle', step: '', detail: '' })
  const handleStatusChange = useCallback((next: StatusInfo) => setInfo(next), [])

  const theme = BADGE_THEME[info.status]
  const isProcessing = info.status === 'processing'

  const label = (isProcessing && info.step) ? info.step
    : ((info.status === 'success' || info.status === 'error') && info.step) ? info.step
      : theme.label

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100 flex flex-col">
      {/* Decorative blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gray-200/40 blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-48 w-[500px] h-[500px] rounded-full bg-gray-100/50 blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-gray-200/30 blur-3xl animate-pulse [animation-delay:4s]" />
      </div>

      {/* Header */}
      <header className="pt-12 pb-2 text-center">
        {/* Dynamic Status Badge */}
        <div className={`
          inline-flex items-center gap-2.5 px-4 py-2 rounded-full
          border shadow-sm backdrop-blur-sm mb-6
          transition-all duration-500 ease-out
          ${theme.bg} ${theme.border}
          ${isProcessing ? 'shadow-md shadow-gray-400/30 px-5' : ''}
        `}>
          <span className="relative flex h-2 w-2 shrink-0">
            {theme.ping && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme.dot}`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 transition-colors duration-300 ${theme.dot}`} />
          </span>

          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-semibold tracking-wide truncate transition-colors duration-300 ${theme.text}`}>
              {label}
            </span>
            {isProcessing && info.detail && (
              <span className="text-[10px] text-gray-400 font-medium truncate max-w-[200px] hidden sm:inline">
                — {info.detail}
              </span>
            )}
          </div>

          <StatusIcon status={info.status} />
        </div>

        {/* Processing shimmer */}
        {isProcessing && (
          <div className="max-w-xs mx-auto mb-4">
            <div className="h-0.5 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-gray-200 via-gray-600 to-gray-200 shimmer-bar" />
            </div>
          </div>
        )}

        <h1 className="text-4xl font-bold text-gray-900">Resume Uploader</h1>
        <p className="mt-3 text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
          Upload your resume and let us handle the rest. We support PDF, DOC, and DOCX files up to 10 MB.
        </p>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
        <div className="w-full max-w-xl p-8 rounded-3xl bg-white/70 backdrop-blur-xl border border-gray-200/60 shadow-xl shadow-gray-200/30">
          <ResumeUploader onStatusChange={handleStatusChange} />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          Your resume is securely processed &middot; Powered by your backend
        </p>
      </footer>
    </div>
  )
}
