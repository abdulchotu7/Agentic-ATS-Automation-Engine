import type { Page } from 'playwright';
import { connectToBrowser, runWithErrorHandler, tryStep } from './utils/browser.ts';
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

async function fillPersonalDetails(page: Page, firstName: string, lastName: string, email: string) {
    console.log('⌨️ Filling in personal details...');
    await page.locator('input[type="file"][name="resume"]').setInputFiles('./temp.txt');
    await page.getByLabel("Phone").pressSequentially("1234567890", { delay: 100 });
    await page.getByLabel("Current location").click();
    await detectAndHandleCaptcha(page);

    await page.getByLabel("Current location").pressSequentially("New York", { delay: 100 });
    const dropdownOptions = page.locator(".dropdown-location");
    await dropdownOptions.first().waitFor({ state: "visible" });

    const count = await dropdownOptions.count();
    console.log(`📋 Found ${count} location options.`);
    if (count > 0) {
        await dropdownOptions.first().click();
    }

    await page.getByLabel("Current company").pressSequentially("Adobe", { delay: 100 });
    await page.getByLabel("LinkedIn URL").pressSequentially("https://www.linkedin.com/in/johndoe", { delay: 100 });

    await answerScreeningQuestions(page);
}

runWithErrorHandler(async () => {
    const { page } = await connectToBrowser();

    console.log('🌐 Navigating to application page...');
    await page.goto('https://jobs.lever.co/findem/e74f2710-a87c-4532-8cdf-9f5d41ad2e06');

    console.log('🔘 Clicking "Apply for this job"...');
    await page.getByRole('link', { name: 'Apply for this job' }).first().click();

    await tryStep('CAPTCHA Check', async () => { await detectAndHandleCaptcha(page); });
    await tryStep('Personal Details', () => fillPersonalDetails(page, 'John', 'Doe', 'john.doe@example.com'));
});