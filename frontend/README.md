# Agentic ATS Automation Engine - Frontend

A modern, high-performance React application for seamless resume uploads and processing. Featuring a sleek, professional monochrome design with real-time status tracking via Server-Sent Events (SSE).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?logo=vite)

## ✨ Features

- **Drag & Drop Upload**: Intuitive interface for uploading resumes (PDF, DOC, DOCX).
- **Real-time Status Tracking**: Uses Server-Sent Events (SSE) to provide live updates on processing steps (e.g., "Initializing", "Parsing", "Completed").
- **Modern UI**: Clean, premium monochrome aesthetic built with Tailwind CSS.
- **Progressive Feedback**: Interactive progress bars and status indicators for a smooth user experience.
- **Robust Error Handling**: Handles network interruptions, file size limits, and backend errors gracefully.

## 🚀 Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite 7](https://vite.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Networking**: [Axios](https://axios-http.com/) for uploads, native `EventSource` for SSE.

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:ConsultaddHQ/ResumeProfilerandApply.git
   cd ResumeProfilerandApply/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## ⚙️ Configuration

The application communicates with a backend service. Ensure your backend is running at `http://localhost:8000` (default).

You can modify the API configuration in `src/components/ResumeUploader.tsx`:

```typescript
const API_BASE = 'http://localhost:8000'
const API_ENDPOINT = `${API_BASE}/upload`
```

## 📂 Project Structure

- `src/components/ResumeUploader.tsx`: The core component handling file validation, uploads, and SSE status updates.
- `src/App.tsx`: The main application layout.
- `src/index.css`: Global styles and Tailwind configuration.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
