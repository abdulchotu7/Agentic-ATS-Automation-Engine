# Playwright Job Automation

Automated job application system using Playwright and AI (OpenAI Agents SDK).

## 🚀 Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file in the root directory and add your API keys:
   ```env
   OPENAI_API_KEY=your_openai_key
   TAVILY_API_KEY=your_tavily_api_key
   ```

3. **Launch Chrome in Debug Mode**:
   The automation connects to an existing Chrome instance. Use the provided script to launch it:
   ```bash
   chmod +x scripts/launch-chrome-debug.sh
   ./scripts/launch-chrome-debug.sh
   ```
   *Note: Ensure you are logged into the necessary sites (LinkedIn, etc.) in the opened Chrome window.*

### 3. Backend Server (Optional)
Starts a FastAPI server to handle resume uploads and job search in the background.

```bash
# 1. Create a virtual environment (recommended)
python3 -m venv venv

# 2. Activate the virtual environment
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Start the server
npm run server
```
The server will be available at `http://localhost:8000`.
You can verify it is running at `http://localhost:8000/health`.

## 🛠️ Usage

### 1. Unified Router (Recommended)
Processes multiple jobs from a job search result JSON file.

**General Format:**
```bash
npm run router -- --result /path/to/result.json [--limit N] [--dry-run]
```

**Concrete Examples:**
```bash
# Process all jobs in result.json
npm run router -- --result ./result.json

# Process only the first 3 jobs
npm run router -- --result ./result.json --limit 3

# Dry run (see the plan without opening a browser)
npm run router -- --result ./result.json --dry-run
```

*Note: The `--` is required to pass arguments through npm to the underlying engine.*

### 2. Running Separate Sites Standalone
You can run specific ATS handlers directly by providing a URL.

```bash
# General Usage:
# RESULT_JSON_PATH=/path/to/result.json npx tsx src/sites/[handler].ts [url]

# Examples:
RESULT_JSON_PATH=result.json npx tsx src/sites/smartrecruiters.ts "https://jobs.smartrecruiters.com/..."
RESULT_JSON_PATH=result.json npx tsx src/sites/greenhouse.ts "https://job-boards.greenhouse.io/..."
RESULT_JSON_PATH=result.json npx tsx src/sites/lever.ts "https://jobs.lever.co/..."
RESULT_JSON_PATH=result.json npx tsx src/sites/myworkday.ts "https://wd1.myworkdayjobs.com/..."
```

## 📁 Project Structure

- `src/router.ts`: Main entry point for processing multiple jobs.
- `src/sites/`: Site-specific automation handlers (Greenhouse, Lever, etc.).
- `src/agent/`: AI agent logic for handling complex forms and screening questions.
- `src/api/`: Backend server and job search agent (Python).
- `src/utils/`: Shared browser and utility functions.
- `scripts/`: Helper scripts for launching Chrome.
- `requirements.txt`: Python backend dependencies.

## 🤖 AI Fallback
The `custom_site.ts` handler and MCP agent serve as universal fallbacks. If a site is not specifically supported, the AI agent will attempt to navigate, scan, and fill the form autonomously.
