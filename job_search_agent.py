#!/usr/bin/env python3
"""
Job Search Agent: Resume as input. Finds relevant jobs on ATS boards from the resume,
deduplicates results, and fills in the information required for these sites (from resume;
elicits anything missing).
"""

import json
import os
from typing import Any

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Job board domains to search (client ATS)
JOB_BOARD_DOMAINS = [
    "greenhouse.io",
    "jobs.lever.co",
    "jobs.smartrecruiters.com",
    "wd1.myworkdayjobs.com",
    "jobs.bamboohr.com",
    "jobs.jobvite.com",
    "careers.icims.com",
    "apply.jazz.co",
    "careers.workable.com",
]


def _ensure_env() -> None:
    if not os.environ.get("TAVILY_API_KEY"):
        raise ValueError(
            "Set TAVILY_API_KEY (get one at https://app.tavily.com). "
            "You can add it to a .env file."
        )
    if not os.environ.get("OPENAI_API_KEY"):
        raise ValueError(
            "Set OPENAI_API_KEY for the agent LLM. You can add it to a .env file."
        )


def _extract_jobs_from_agent_messages(messages: list[Any]) -> list[dict[str, Any]]:
    """Parse tool messages from agent run to get Tavily search results; dedupe by URL."""
    seen_urls: set[str] = set()
    jobs: list[dict[str, Any]] = []

    for msg in messages:
        if getattr(msg, "type", None) != "tool":
            continue
        name = getattr(msg, "name", "") or ""
        if "tavily" not in name.lower():
            continue
        content = getattr(msg, "content", None) or ""
        if isinstance(content, list):
            content = content[0].get("text", "") if content else ""
        try:
            data = json.loads(content) if isinstance(content, str) else content
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        results = data.get("results") or []
        for r in results:
            url = (r.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            jobs.append({
                "title": r.get("title") or "Job",
                "url": url,
                "content": (r.get("content") or "")[:2000],
            })
    return jobs


def _extract_search_and_application_data(resume_text: str) -> dict[str, Any]:
    """From resume text: extract job-search query and structured fields for ATS application forms."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    system = """You are an assistant that parses resumes for job search and application forms.

Given a resume (text), output a JSON object with exactly these keys:

1) "search_query": A short search string to find relevant jobs (e.g. "Software Engineer Python" or "Data Analyst remote"). Use the person's target role, key skills, and experience. One line.

2) "application_data": An object with the fields that job application sites (Greenhouse, Lever, Workday, BambooHR, Jobvite, iCIMS, Jazz, Workable) typically require. Extract from the resume where possible. Use null for anything not in the resume. Structure:
   - contact: { full_name, email, phone, city, state, country, linkedin_url }
   - current_or_most_recent_role: { job_title, company, start_date, end_date, summary }
   - work_experience: list of { job_title, company, start_date, end_date, summary } (most recent 2-3)
   - education: list of { degree, institution, year_or_date }
   - skills: list of strings (key technical and soft skills)
   - certifications: list of strings (if any)

3) "missing_required": List of strings. Things that these ATS sites often require but that are NOT present in the resume (e.g. "Phone number", "LinkedIn URL", "Address"). Be brief. If nothing critical is missing, use [].

Output only valid JSON, no markdown code fence."""

    msgs = [
        SystemMessage(content=system),
        HumanMessage(content=f"Resume:\n\n{resume_text[:12000]}"),
    ]
    out = llm.invoke(msgs)
    raw = out.content if hasattr(out, "content") else str(out)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "search_query": "Software Engineer",
            "application_data": {},
            "missing_required": ["Could not parse resume; check format."],
        }


def _format_application_data_for_sites(application_data: dict[str, Any], missing: list[str]) -> str:
    """Format extracted application data and missing fields for use on ATS sites."""
    sections = ["## Information for job application sites (from your resume)\n"]
    if application_data:
        sections.append(json.dumps(application_data, indent=2))
    if missing:
        sections.append("\n## Required by many sites but not in resume – please provide\n")
        for m in missing:
            sections.append(f"  - {m}")
    return "\n".join(sections)


def _load_resume_with_docloader(resume_input: str) -> str:
    """
    Load resume using LangChain document loaders. Supports .txt, .md, .pdf, .docx.
    If input is not a file path, returns it as-is (inline resume text).
    """
    resume_input = resume_input.strip()
    if not os.path.isfile(resume_input):
        return resume_input

    path = os.path.abspath(resume_input)
    ext = os.path.splitext(path)[1].lower()

    # LangChain document loaders by file type
    if ext in (".txt", ".md", ".markdown"):
        from langchain_community.document_loaders import TextLoader
        loader = TextLoader(path, encoding="utf-8", autodetect_encoding=True)
    elif ext == ".pdf":
        from langchain_community.document_loaders import PyPDFLoader
        loader = PyPDFLoader(path)
    elif ext in (".docx", ".doc"):
        from langchain_community.document_loaders.word_document import Docx2txtLoader
        loader = Docx2txtLoader(path)
    else:
        # Fallback: try TextLoader for unknown extensions (e.g. .rtf, .log)
        from langchain_community.document_loaders import TextLoader
        loader = TextLoader(path, encoding="utf-8", autodetect_encoding=True)

    documents = loader.load()
    if not documents:
        return ""
    # Join all page/section contents into one resume text
    return "\n\n".join(doc.page_content for doc in documents if getattr(doc, "page_content", None))


def run_job_search(resume_input: str) -> dict[str, Any]:
    """
    Resume as input. Find relevant jobs on ATS boards from the resume; fill in
    application fields required for these sites (from resume); elicit anything missing.

    resume_input: Resume text or path to a resume file (.txt, .md, .pdf, .docx). Uses LangChain document loaders.
    """
    _ensure_env()

    resume_text = _load_resume_with_docloader(resume_input)
    if not resume_text.strip():
        raise ValueError("Resume is empty. Provide resume text or a path to a resume file.")

    # Extract search query and application data from resume
    parsed = _extract_search_and_application_data(resume_text)
    search_query = parsed.get("search_query") or "Software Engineer"
    application_data = parsed.get("application_data") or {}
    missing_required = parsed.get("missing_required") or []

    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI
    from langchain_tavily import TavilySearch
    from langgraph.prebuilt import create_react_agent

    tavily = TavilySearch(
        max_results=8,
        search_depth="advanced",
        include_domains=JOB_BOARD_DOMAINS,
    )
    model = ChatOpenAI(model="gpt-4o", temperature=0)
    agent = create_react_agent(model, [tavily])

    system_instruction = f"""You are a job search assistant. Find job postings that match this candidate's profile on these ATS job boards only: {', '.join(JOB_BOARD_DOMAINS)}.

Use the tavily_search tool with:
- query: search for relevant jobs (e.g. "jobs {search_query}" or "{search_query}")
- include_domains: use the list {JOB_BOARD_DOMAINS} so results come only from these boards

Call the search tool to find relevant jobs. Do not repeat the same URL in your summary. After you have results, briefly list the unique jobs found (title and URL). You do not need to call the tool more than once or twice if you already have enough results."""

    config = {"configurable": {"thread_id": "job-search-1"}}
    user_content = f"{system_instruction}\n\nSearch for jobs matching this candidate: {search_query}"

    final_state = None
    for chunk in agent.stream(
        {"messages": [HumanMessage(content=user_content)]},
        config=config,
        stream_mode="values",
    ):
        final_state = chunk

    messages = (final_state or {}).get("messages", [])
    jobs = _extract_jobs_from_agent_messages(messages)
    application_for_sites = _format_application_data_for_sites(application_data, missing_required)

    return {
        "resume_input": os.path.abspath(resume_input) if os.path.isfile(resume_input) else (resume_input[:200] + "..." if len(resume_input) > 200 else resume_input),
        "search_query": search_query,
        "unique_jobs_count": len(jobs),
        "jobs": jobs,
        "application_data": application_data,
        "missing_required": missing_required,
        "application_for_sites": application_for_sites,
    }


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(
        description="Resume as input: find relevant jobs on ATS boards and fill in application fields."
    )
    parser.add_argument(
        "resume",
        nargs="?",
        default="",
        help="Resume text or path to resume file (.txt, .md, etc.)",
    )
    parser.add_argument(
        "--resume-file",
        "-f",
        dest="resume_file",
        help="Path to resume file (alternative to positional resume)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full output as JSON",
    )
    args = parser.parse_args()

    resume_input = args.resume_file or args.resume
    if not resume_input:
        parser.error("Provide resume text or path to a resume file (e.g. resume.txt or paste text).")

    result = run_job_search(resume_input)

    if args.json:
        out = {
            "search_query": result["search_query"],
            "unique_jobs_count": result["unique_jobs_count"],
            "jobs": [
                {**j, "content": j["content"][:300] + "..." if len(j["content"]) > 300 else j["content"]}
                for j in result["jobs"]
            ],
            "application_data": result["application_data"],
            "missing_required": result["missing_required"],
            "application_for_sites": result["application_for_sites"],
        }
        print(json.dumps(out, indent=2))
    else:
        print(f"Search query (from resume): {result['search_query']}\n")
        print(f"Unique jobs found: {result['unique_jobs_count']}\n")
        for i, j in enumerate(result["jobs"][:15], 1):
            print(f"  {i}. {j['title']}")
            print(f"     {j['url']}")
        print("\n" + result["application_for_sites"])
        with open("result.json", "w") as f:
            json.dump(result, f, indent=4)


if __name__ == "__main__":
    main()
