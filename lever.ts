import type { Page } from 'playwright';
import type { ProfileData } from './types.ts';
import { connectToBrowser, runWithErrorHandler, tryStep, fillIfEmpty } from './utils/browser.ts';
import { answerScreeningQuestions } from './agent/screeningAgent.ts';

/**
 * Detects common CAPTCHA challenges by scanning the main page and all sub-frames.
 */
async function detectAndHandleCaptcha(page: Page) {
    const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[title*="hCaptcha"]',
        'iframe[src*="challenges.cloudflare.com"]',
        'div.g-recaptcha',
        '#h-captcha',
        'div[data-sitekey]',
        '.cf-turnstile',
        '#cf-challenge-running',
        'input#hcaptchaResponseInput',
        '[name="h-captcha-response"]'
    ];

    console.log('🔍 Checking for CAPTCHA/Challenges...');
    let isChallengeActive = false;

    // Initial polling window (5 seconds) to catch delayed pop-ups
    for (let i = 0; i < 10; i++) {
        for (const frame of page.frames()) {
            for (const selector of captchaSelectors) {
                try {
                    if (await frame.locator(selector).first().isVisible()) {
                        console.log(`🛡️ Challenge Detected: ${selector}`);
                        isChallengeActive = true;
                        break;
                    }
                } catch (e) { }
            }
            if (isChallengeActive) break;
        }
        if (isChallengeActive) break;
        await page.waitForTimeout(500);
    }

    if (isChallengeActive) {
        console.log('🚫 CAPTCHA BLOCKED: Waiting for manual/service resolution...');
        while (isChallengeActive) {
            await page.waitForTimeout(2000);
            let stillFound = false;
            for (const frame of page.frames()) {
                for (const selector of captchaSelectors) {
                    try {
                        if (await frame.locator(selector).first().isVisible()) {
                            stillFound = true;
                            break;
                        }
                    } catch (e) { }
                }
                if (stillFound) break;
            }
            if (!stillFound) {
                console.log('✅ Challenge cleared! Resuming automation...');
                isChallengeActive = false;
            }
        }
        return true;
    }

    console.log('✅ No active challenge detected.');
    return false;
}

async function fillPersonalDetails(page: Page, profile: ProfileData, resumePath: string) {
    console.log('📤 Uploading resume...');
    await page.locator('input[type="file"][name="resume"]').setInputFiles(resumePath);
    console.log('⏳ Waiting 3s for auto-fill from resume...');
    await page.waitForTimeout(3000);

    console.log('⌨️ Filling personal details (only empty fields)...');
    await fillIfEmpty(page.getByLabel("Phone"), profile.contact.phone || "1234567890", { label: "Phone" });

    await page.getByLabel("Current location").click();
    await detectAndHandleCaptcha(page);

    // Location — check if already filled
    const locationField = page.getByLabel("Current location");
    const locationValue = await locationField.inputValue().catch(() => '');
    if (!locationValue || locationValue.trim().length === 0) {
        const city = profile.contact.city || 'New York';
        await locationField.pressSequentially(city, { delay: 100 });
        const dropdownOptions = page.locator(".dropdown-location");
        await dropdownOptions.first().waitFor({ state: "visible" });
        const count = await dropdownOptions.count();
        console.log(`📋 Found ${count} location options.`);
        if (count > 0) {
            await dropdownOptions.first().click();
        }
    } else {
        console.log(`   ⏭️ Current location already filled: "${locationValue}"`);
        // Still need to handle the dropdown if it appeared
        const dropdownOptions = page.locator(".dropdown-location");
        const count = await dropdownOptions.count();
        if (count > 0) {
            console.log(`📋 Found ${count} location options.`);
            await dropdownOptions.first().click();
        }
    }

    const currentRole = profile.current_or_most_recent_role;
    await fillIfEmpty(page.getByLabel("Current company"), currentRole?.company || "N/A", { label: "Current company" });
    await fillIfEmpty(page.getByLabel("LinkedIn URL"), profile.contact.linkedin_url || "https://linkedin.com/in/profile", { label: "LinkedIn URL" });

    await answerScreeningQuestions(page);
}

/**
 * Exported handler for Lever job applications.
 * Called by the router with dynamic URL and profile data.
 */
export async function runLever(page: Page, jobUrl: string, profile: ProfileData, resumePath: string): Promise<void> {
    console.log('🌐 Navigating to Lever application page...');
    await page.goto(jobUrl);

    console.log('🔘 Clicking "Apply for this job"...');
    await page.getByRole('link', { name: 'Apply for this job' }).first().click();

    await tryStep('CAPTCHA Check', async () => { await detectAndHandleCaptcha(page); });
    await tryStep('Personal Details', () => fillPersonalDetails(page, profile, resumePath));
}

// ── Standalone mode (run directly) ──────────────────────────────────────────
if (process.argv[1]?.endsWith('lever.ts')) {
    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const url = process.argv[2] || 'https://jobs.lever.co/findem/e74f2710-a87c-4532-8cdf-9f5d41ad2e06';
        const { readFileSync } = await import('fs');
        const data = JSON.parse(readFileSync('/Users/consultadd/projects/ResumeProfilerandApply/result.json', 'utf-8'));
        await runLever(page, url, data.application_data, data.resume_input);
    });
}