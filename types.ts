/**
 * Shared TypeScript interfaces for the job automation router.
 * These types mirror the JSON structure output by job_search_agent.py.
 */

export interface ContactInfo {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    country: string;
    linkedin_url: string | null;
}

export interface RoleInfo {
    job_title: string;
    company: string;
    start_date: string;
    end_date: string | null;
    summary: string;
}

export interface EducationEntry {
    degree: string;
    institution: string;
    year_or_date: string;
}

export interface ProfileData {
    contact: ContactInfo;
    current_or_most_recent_role: RoleInfo;
    work_experience: RoleInfo[];
    education: EducationEntry[];
    skills: string[];
    certifications: string[];
}

export interface JobEntry {
    title: string;
    url: string;
    content: string;
}

export interface JobSearchResult {
    resume_input: string;
    search_query: string;
    unique_jobs_count: number;
    jobs: JobEntry[];
    application_data: ProfileData;
    missing_required: string[];
    application_for_sites: string;
}

export interface AutomationResult {
    url: string;
    title: string;
    handler: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
}
