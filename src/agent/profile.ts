import { readFileSync, readdirSync } from 'fs';

// ── Lazy-loaded profile ─────────────────────────────────────────────────────
// The result JSON path comes from RESULT_JSON_PATH env var (set by router.ts)
// or falls back to the hardcoded path for standalone usage.
// Lazy: the file is read on first access, NOT at import time.

let _cached: { profile: string; resumePath: string } | null = null;

function _load(): { profile: string; resumePath: string } {
   if (_cached) return _cached;

   let jsonPath = process.env.RESULT_JSON_PATH || '';
   if (!jsonPath) {
      // Find the latest result.json in the results directory
      const resultsDir = './results';
      try {
         const files = readdirSync(resultsDir)
            .filter((f: string) => f.endsWith('_result.json'))
            .sort()
            .reverse();
         if (files.length > 0) {
            jsonPath = `${resultsDir}/${files[0]}`;
         } else {
            jsonPath = './result.json';
         }
      } catch {
         jsonPath = './result.json';
      }
   }

   console.log(`📄 Loading profile from: ${jsonPath}`);
   const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
   const resumePath: string = raw.resume_input;
   const data = raw.application_data;
   const contact = data.contact;

   const experience = (data.work_experience || [])
      .map((exp: any, i: number) => {
         const end = exp.end_date || 'Present';
         return `${i + 1}. ${exp.job_title} @ ${exp.company} (${exp.start_date} - ${end}):\n   ${exp.summary}`;
      })
      .join('\n');

   const skills = (data.skills || []).join(', ');

   const profile = `
Candidate Name: ${contact.first_name} ${contact.last_name}
Role: ${data.current_or_most_recent_role.job_title}
Email: ${contact.email}
Phone: ${contact.phone}
Location: ${contact.city}, ${contact.state}, ${contact.country}
LinkedIn: ${contact.linkedin_url || 'https://linkedin.com/in/profile'}

Skills: ${skills}

Experience:
${experience}

Work Authorization: Yes (US Citizen)
Resume File: ${resumePath}
Street: 123 Main St
Zip Code: 10001

Tone: Professional, concise, confident.
`.trim();

   _cached = { profile, resumePath };
   return _cached;
}

/** Get the candidate profile string (lazy-loaded on first call). */
export function getCandidateProfile(): string {
   return _load().profile;
}

/** Get the resume file path (lazy-loaded on first call). */
export function getResumePath(): string {
   return _load().resumePath;
}