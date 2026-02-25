import { readFileSync } from 'fs';

const PROFILE_JSON_PATH = '/Users/consultadd/projects/ResumeProfilerandApply/result.json';

const raw = JSON.parse(readFileSync(PROFILE_JSON_PATH, 'utf-8'));
export const resumePath: string = raw.resume_input;

function loadProfile(): string {
   const data = raw.application_data;
   const contact = data.contact;

   const experience = data.work_experience
      .map((exp: any, i: number) => {
         const end = exp.end_date || 'Present';
         return `${i + 1}. ${exp.job_title} @ ${exp.company} (${exp.start_date} - ${end}):\n   ${exp.summary}`;
      })
      .join('\n');

   const skills = data.skills.join(', ');

   return `
Candidate Name: ${contact.full_name}
Role: ${data.current_or_most_recent_role.job_title}
Email: ${contact.email}
Phone: ${contact.phone}
Location: ${contact.city}, ${contact.state}, ${contact.country}
LinkedIn: ${contact.linkedin_url || 'https://linkedin.com/in/laksvansh'}

Skills: ${skills}

Experience:
${experience}

Work Authorization: Yes (US Citizen)
Resume File: ${resumePath}
Street: 123 Main St
Zip Code: 10001

Tone: Professional, concise, confident.
`.trim();
}

export const candidateProfile = loadProfile();