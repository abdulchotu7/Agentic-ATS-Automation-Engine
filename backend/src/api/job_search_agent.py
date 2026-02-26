#!/usr/bin/env python3
"""
Job Search Agent: Resume as input. Finds relevant jobs on ATS boards from the resume,
deduplicate results, and fills in the information required for these sites (from resume;
elicits anything missing).
"""

import json
import os
from typing import Any
from urllib.parse import urlparse

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
    """From resume text: extract multiple job-search queries and structured fields for ATS application forms."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    system = """You are an assistant that parses resumes for job search and application forms.

Given a resume (text), output a JSON object with exactly these keys:

1) "search_queries": A list of 6 different search strings to maximize job discovery. IMPORTANT: All queries MUST target US-based positions that are remote OR contract. Each should target a different angle:
   - Primary role query (e.g. "Data Engineer remote United States")
   - Skills-focused query (e.g. "Python Snowflake AWS data engineer contract US")
   - Seniority variant (e.g. "Senior Data Engineer remote USA")
   - Alternative title (e.g. "ETL Developer US contract remote")
   - Site-specific query using greenhouse or lever (e.g. "site:greenhouse.io Data Engineer remote")
   - Explicit US location query (e.g. "Data Engineer New York OR California OR Texas remote")
   Keep each query 4-8 words. ALWAYS include location qualifiers: "United States", "US", "USA", "remote US", or US city/state names. This is critical to avoid non-US results.

2) "search_query": The single best search query from search_queries (for backward compatibility).

3) "application_data": An object with the fields that job application sites (Greenhouse, Lever, Workday, BambooHR, Jobvite, iCIMS, Jazz, Workable) typically require. Extract from the resume where possible. Use null for anything not in the resume. Structure:
   - contact: { first_name, last_name, email, phone, city, state, country, linkedin_url }
   - current_or_most_recent_role: { job_title, company, start_date, end_date, summary }
   - work_experience: list of { job_title, company, start_date, end_date, summary } (most recent 2-3)
   - education: list of { degree, institution, year_or_date }
   - skills: list of strings (key technical and soft skills)
   - certifications: list of strings (if any)

4) "missing_required": List of strings. Things that these ATS sites often require but that are NOT present in the resume (e.g. "Phone number", "LinkedIn URL", "Address"). Be brief. If nothing critical is missing, use [].

CRITICAL: In "summary" and "skills" fields, NEVER use semicolons (;). Use periods or commas instead. Output only valid JSON, no markdown code fence."""

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
        # Pre-process raw string to replace semicolons if they escaped the prompt
        raw_clean = raw.replace(";", ".")
        return json.loads(raw_clean)
    except json.JSONDecodeError:
        return {
            "search_queries": ["Software Engineer"],
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


def _is_job_posting_url(url: str) -> bool:
    """Filter out non-job-posting URLs (blog posts, listing pages, etc.)."""
    url_lower = url.lower().rstrip("/")
    # Must be from an ATS domain
    if not any(domain in url_lower for domain in JOB_BOARD_DOMAINS):
        return False
    # Reject obvious non-job URLs
    reject_patterns = ["/blog", "/about", "/press", "/news", "/help", "/faq", "/privacy", "/terms"]
    if any(p in url_lower for p in reject_patterns):
        return False
    # Reject listing pages (no job ID in URL)
    path = urlparse(url_lower).path.rstrip("/")
    path_parts = [p for p in path.split("/") if p]
    # Greenhouse: need at least /company/jobs/ID
    if "greenhouse.io" in url_lower:
        if "/jobs/" not in url_lower:
            return False  # listing page like greenhouse.io/company
    # Lever: need at least /company/UUID
    if "jobs.lever.co" in url_lower:
        if len(path_parts) < 2:
            return False  # listing page like jobs.lever.co/company
    # SmartRecruiters: need at least /Company/JobSlug
    if "smartrecruiters.com" in url_lower:
        if len(path_parts) < 2:
            return False
    return True


def _llm_filter_us_jobs(jobs: list[dict]) -> list[dict]:
    """Use LLM to cross-check job listings and keep only US-based remote/contract roles."""
    if not jobs:
        return jobs

    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Build a compact list for the LLM to evaluate
    job_lines = []
    for i, j in enumerate(jobs):
        snippet = j.get("content", "")[:200].replace("\n", " ")
        job_lines.append(f"{i}. TITLE: {j['title']} | URL: {j['url']} | SNIPPET: {snippet}")

    job_list_text = "\n".join(job_lines)

    system = """You are a job location filter. You will receive a numbered list of job postings.

For EACH job, determine if it is US-based (United States). A job is US-based if:
- The title or snippet mentions a US city, US state, or "US" / "USA" / "United States"
- The title says "Remote" without specifying a non-US country
- The snippet mentions US locations or US work authorization

A job is NOT US-based if:
- It mentions non-US countries (Poland, Romania, New Zealand, India, UK, Germany, Australia, etc.)
- It says "Remote" but specifies a non-US region (e.g., "Remote - ANZ", "Remote EMEA", "Remote APAC")
- The URL or title contains non-US location identifiers
- If ambiguous or location-unclear, INCLUDE it (err on the side of keeping jobs)

Output ONLY a JSON array of the index numbers (integers) of jobs that ARE US-based.
Example output: [0, 2, 5, 7]
If none qualify: []
Output ONLY the JSON array, nothing else."""

    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Filter these {len(jobs)} jobs — keep only US-based:\n\n{job_list_text}"),
    ])

    raw = response.content.strip() if hasattr(response, "content") else str(response).strip()
    # Parse the JSON array of indices
    try:
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        keep_indices = json.loads(raw)
        if not isinstance(keep_indices, list):
            print("⚠️ LLM filter returned non-list, keeping all jobs")
            return jobs
        filtered = [jobs[i] for i in keep_indices if isinstance(i, int) and 0 <= i < len(jobs)]
        return filtered
    except (json.JSONDecodeError, IndexError) as e:
        print(f"⚠️ LLM filter parse error ({e}), keeping all jobs")
        return jobs


def run_job_search(resume_input: str) -> dict[str, Any]:
    """
    Resume as input. Find relevant jobs on ATS boards from the resume; fill in
    application fields required for these sites (from resume); elicit anything missing.

    Uses multiple search queries for broader coverage.
    resume_input: Resume text or path to a resume file (.txt, .md, .pdf, .docx).
    """
    _ensure_env()

    resume_text = _load_resume_with_docloader(resume_input)
    if not resume_text.strip():
        raise ValueError("Resume is empty. Provide resume text or a path to a resume file.")

    # Extract multiple search queries and application data from resume
    parsed = _extract_search_and_application_data(resume_text)
    search_queries = parsed.get("search_queries") or [parsed.get("search_query") or "Software Engineer"]
    search_query = parsed.get("search_query") or search_queries[0]
    application_data = parsed.get("application_data") or {}
    missing_required = parsed.get("missing_required") or []

    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI
    from langchain_tavily import TavilySearch
    from langgraph.prebuilt import create_react_agent

    tavily = TavilySearch(
        max_results=25,
        search_depth="advanced",
        include_domains=JOB_BOARD_DOMAINS,
    )
    model = ChatOpenAI(model="gpt-4o", temperature=0)
    agent = create_react_agent(model, [tavily])

    # Format the multiple queries for the agent
    queries_formatted = "\n".join(f"  {i+1}. \"{q}\"" for i, q in enumerate(search_queries))

    system_instruction = f"""You are a job search assistant. Find as many relevant job postings as possible for this candidate.

TARGET: ONLY US-based positions (United States). Must be REMOTE or CONTRACT. Strictly ignore:
- Jobs in non-US countries (Poland, Romania, India, UK, Germany, Australia, New Zealand, etc.)
- Region-locked remote roles ("Remote - ANZ", "Remote EMEA", "Remote APAC")
- On-site-only positions outside the US

SEARCH STRATEGY — you MUST run multiple searches:
{queries_formatted}

For EACH query above, call the tavily_search tool separately. That means you should make {len(search_queries)} separate tool calls minimum.

After running all searches, run 2-3 ADDITIONAL searches:
- Try appending "United States" or "US" to your best-performing query
- Try "independent contractor" or "C2C" or "W2 contract" variations
- Try different seniority levels ("senior", "lead", "staff")
- Try major US tech hubs: "New York", "San Francisco", "Austin", "Seattle" with the role title

URL QUALITY RULES — READ CAREFULLY:
- ONLY collect URLs that point to a SINGLE job posting (e.g. greenhouse.io/company/jobs/12345)
- REJECT listing pages that show multiple jobs (e.g. greenhouse.io/company or jobs.lever.co/company)
- REJECT URLs ending in just a company name with no job ID
- Good URL patterns:
  * greenhouse.io/company/jobs/1234567
  * jobs.lever.co/company/uuid-here
  * jobs.smartrecruiters.com/Company/12345-job-title  
  * wd1.myworkdayjobs.com/en-US/Company/job/Title_ID
- Bad URL patterns (SKIP these):
  * greenhouse.io/company (listing page)
  * jobs.lever.co/company (listing page)
  * Any URL without a job-specific ID or slug

IMPORTANT RULES:
- Each search should use include_domains: {JOB_BOARD_DOMAINS}
- PRIORITIZE: remote, contract, freelance, C2C, independent contractor positions in the US
- We want QUANTITY of QUALITY — many unique, real job posting URLs
- Do NOT stop after the first search — run ALL the queries listed above
- After all searches, list all unique jobs found (title + URL)
- Do NOT repeat the same URL
- If a result title mentions a non-US country, SKIP it"""

    config = {"configurable": {"thread_id": "job-search-1"}}
    user_content = f"{system_instruction}\n\nCandidate profile summary: {search_query}\nStart searching now."

    print(f"🔍 Running {len(search_queries)} search queries:")
    for i, q in enumerate(search_queries, 1):
        print(f"   {i}. {q}")

    final_state = None
    for chunk in agent.stream(
        {"messages": [HumanMessage(content=user_content)]},
        config=config,
        stream_mode="values",
    ):
        final_state = chunk

    messages = (final_state or {}).get("messages", [])
    jobs = _extract_jobs_from_agent_messages(messages)

    # Filter to actual job posting URLs
    jobs = [j for j in jobs if _is_job_posting_url(j["url"])]
    print(f"📋 {len(jobs)} jobs after URL filtering")

    # LLM cross-check: remove non-US jobs
    print("🇺🇸 Running LLM filter to keep only US-based jobs...")
    pre_filter_count = len(jobs)
    jobs = _llm_filter_us_jobs(jobs)
    print(f"✅ {len(jobs)} US-based jobs kept (removed {pre_filter_count - len(jobs)} non-US)")


    application_for_sites = _format_application_data_for_sites(application_data, missing_required)

    return {
        "resume_input": os.path.abspath(resume_input) if os.path.isfile(resume_input) else (resume_input[:200] + "..." if len(resume_input) > 200 else resume_input),
        "search_query": search_query,
        "search_queries": search_queries,
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
