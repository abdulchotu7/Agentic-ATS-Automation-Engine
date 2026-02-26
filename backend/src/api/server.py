#!/usr/bin/env python3
"""
FastAPI server for resume upload.
Accepts a resume file via POST /upload, runs the job search agent in the background,
saves results to results/, then forwards them to the automation router.
Streams real-time status updates to the frontend via SSE.
"""

import asyncio
import json
import os
import signal
import subprocess
import threading
from datetime import datetime
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from .job_search_agent import run_job_search
except (ImportError, ValueError):
    from job_search_agent import run_job_search

# Path to the Backend automation project (root relative to this file)
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

app = FastAPI(title="Resume Profiler & Apply")

# Allow CORS from any origin (frontend dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}
UPLOAD_DIR = BACKEND_DIR / "uploads"
RESULTS_DIR = BACKEND_DIR / "results"

# Ensure directories exist
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# ── Status tracking ──────────────────────────────────────────────────────────
# Each task_id maps to a list of status events and a threading.Event for completion
_task_status: dict[str, list[dict]] = {}
_task_done: dict[str, threading.Event] = {}
_task_process: dict[str, subprocess.Popen] = {}  # Track running subprocesses for stop


def _emit(task_id: str, status: str, step: str, detail: str = "") -> None:
    """Append a status event for a task."""
    event = {"status": status, "step": step, "detail": detail}
    _task_status.setdefault(task_id, []).append(event)
    print(f"[{task_id}] {status} {step}" + (f" — {detail}" if detail else ""))


def _stream_process(task_id: str, proc: subprocess.Popen) -> int:
    """Read stdout/stderr line-by-line and emit each as a live log event."""
    # Read stdout line by line in real-time
    if proc.stdout:
        for line in iter(proc.stdout.readline, ""):
            line = line.rstrip("\n")
            if line:
                _emit(task_id, "📋", "log", line)
    proc.wait()
    # Capture any remaining stderr
    if proc.stderr:
        stderr = proc.stderr.read()
        if stderr and stderr.strip():
            for line in stderr.strip().split("\n")[-10:]:  # Last 10 error lines
                _emit(task_id, "⚠️", "error", line)
    return proc.returncode


def _run_pipeline(task_id: str, resume_path: str, result_path: str) -> None:
    """Background task: run job search → save JSON → call automation router."""
    try:
        # Step 1: Job search
        _emit(task_id, "🔍", "Job search running...")
        result = run_job_search(resume_path)
        with open(result_path, "w") as f:
            json.dump(result, f, indent=4)
        job_count = result.get("unique_jobs_count", 0)
        _emit(task_id, "✅", "Job search complete", f"{job_count} jobs found → {result_path}")

        # Step 2: Call the TypeScript automation router with live streaming
        _emit(task_id, "🤖", "Launching automation router...")
        abs_result_path = str(Path(result_path).resolve())
        router_cmd = [
            "npm", "run", "router", "--",
            "--result", abs_result_path,
            "--limit", "10",
        ]
        _emit(task_id, "🔧", "Router command", " ".join(router_cmd))

        # Use Popen for live log streaming
        proc = subprocess.Popen(
            router_cmd,
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,              # Line-buffered
            start_new_session=True,  # Own process group for clean kill
        )

        # Track the process so it can be stopped via /stop endpoint
        _task_process[task_id] = proc

        returncode = _stream_process(task_id, proc)

        # Clean up process reference
        _task_process.pop(task_id, None)

        if returncode != 0:
            _emit(task_id, "⚠️", "Router finished with errors", f"exit code {returncode}")
        else:
            _emit(task_id, "✅", "Automation router completed successfully")

    except Exception as e:
        error = {"error": str(e)}
        with open(result_path, "w") as f:
            json.dump(error, f, indent=4)
        _emit(task_id, "❌", "Pipeline failed", str(e))

    finally:
        _task_process.pop(task_id, None)
        _emit(task_id, "🏁", "done")
        _task_done[task_id].set()


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint to verify server status."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/upload")
async def upload_resume(
    background_tasks: BackgroundTasks,
    resume: UploadFile = File(...),
):
    """Upload a resume and start the pipeline. Returns a task_id for SSE status tracking."""
    ext = Path(resume.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Save uploaded file
    task_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    saved_filename = f"{task_id}_{resume.filename}"
    saved_path = str((UPLOAD_DIR / saved_filename).resolve())

    content = await resume.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    # Init status tracking
    _task_status[task_id] = []
    _task_done[task_id] = threading.Event()
    _emit(task_id, "📤", "Resume uploaded", saved_filename)

    # Start pipeline in background
    result_path = str(RESULTS_DIR / f"{task_id}_result.json")
    background_tasks.add_task(_run_pipeline, task_id, saved_path, result_path)

    return {
        "message": "Resume uploaded successfully. Job search started.",
        "task_id": task_id,
    }


@app.get("/status/{task_id}")
async def stream_status(task_id: str):
    """SSE endpoint: streams real-time status updates for a pipeline task."""
    if task_id not in _task_status and task_id not in _task_done:
        raise HTTPException(status_code=404, detail=f"Unknown task_id: {task_id}")

    async def event_generator():
        sent = 0
        while True:
            events = _task_status.get(task_id, [])
            # Send any new events
            while sent < len(events):
                evt = events[sent]
                yield {
                    "event": "status",
                    "data": json.dumps(evt),
                }
                sent += 1
                # If this was the final event, stop
                if evt["step"] == "done":
                    return
            # Wait a bit before checking for new events
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@app.post("/stop/{task_id}")
async def stop_task(task_id: str):
    """Stop a running automation task. Kills the router subprocess."""
    proc = _task_process.get(task_id)
    if not proc:
        raise HTTPException(
            status_code=404,
            detail=f"No running process for task_id: {task_id}. It may have already finished.",
        )

    try:
        # Kill the entire process group (router + any child Playwright processes)
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        _emit(task_id, "🛑", "Automation stopped by user")
    except ProcessLookupError:
        _emit(task_id, "⚠️", "Process already exited")
    except Exception as e:
        # Fallback: kill just the main process
        proc.kill()
        _emit(task_id, "🛑", "Automation force-stopped", str(e))

    return {"message": f"Task {task_id} stop signal sent."}


def _run_router_only(task_id: str, result_json_path: str, limit: int) -> None:
    """Background task: skip job search, go straight to the automation router."""
    try:
        _emit(task_id, "🤖", "Launching automation router (from existing JSON)...")
        abs_result_path = str(Path(result_json_path).resolve())
        router_cmd = [
            "npm", "run", "router", "--",
            "--result", abs_result_path,
            "--limit", str(limit),
        ]
        _emit(task_id, "🔧", "Router command", " ".join(router_cmd))

        proc = subprocess.Popen(
            router_cmd,
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            start_new_session=True,
        )

        _task_process[task_id] = proc
        returncode = _stream_process(task_id, proc)
        _task_process.pop(task_id, None)

        if returncode != 0:
            _emit(task_id, "⚠️", "Router finished with errors", f"exit code {returncode}")
        else:
            _emit(task_id, "✅", "Automation router completed successfully")

    except Exception as e:
        _emit(task_id, "❌", "Router failed", str(e))

    finally:
        _task_process.pop(task_id, None)
        _emit(task_id, "🏁", "done")
        _task_done[task_id].set()


@app.post("/run")
async def run_from_json(
    background_tasks: BackgroundTasks,
    result_json: str,
    limit: int = 4,
):
    """
    Run the automation router directly from an existing result JSON.
    Skips resume upload and job search entirely.
    """
    json_path = Path(result_json)
    if not json_path.is_absolute():
        json_path = BACKEND_DIR / json_path

    if not json_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {json_path}")

    task_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    _task_status[task_id] = []
    _task_done[task_id] = threading.Event()
    _emit(task_id, "📋", "Using existing result JSON", str(json_path))

    background_tasks.add_task(_run_router_only, task_id, str(json_path), limit)

    return {
        "message": "Automation started from existing JSON.",
        "task_id": task_id,
        "result_json": str(json_path),
    }


@app.get("/results")
async def list_results():
    """List all available result JSON files."""
    files = sorted(RESULTS_DIR.glob("*_result.json"), reverse=True)
    return [
        {
            "filename": f.name,
            "path": str(f.relative_to(BACKEND_DIR)),
            "size_kb": round(f.stat().st_size / 1024, 1),
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in files
    ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
