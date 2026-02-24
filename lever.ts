import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { answerScreeningQuestions } from "./agent/screeningAgent.ts";

// Enable debug logging for the OpenAI Agents SDK to show thought process/reasoning steps
process.env.DEBUG = "openai:agents:*";
/**
 * Connects to an existing Chrome browser instance via CDP.
 */
async function connectToBrowser(cdpUrl: string = "http://localhost:9222/"): Promise<{ browser: Browser, page: Page }> {
    console.log('🔗 Connecting to Chrome...');
    const browser = await chromium.connectOverCDP(cdpUrl);
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    console.log('✅ Connected to browser session.');
    return { browser, page };
}

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
                    const captcha = frame.locator(selector).first();
                    if (await captcha.isVisible()) {
                        console.log(`�️ Challenge Detected: ${selector}`);
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
        console.log('� CAPTCHA BLOCKED: Waiting for manual/service resolution...');

        // Loop indefinitely until ALL challenges are gone
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
    // await page.getByLabel("Full name").pressSequentially(`${firstName} ${lastName}`, { delay: 100 });
    // await page.getByLabel("Email").pressSequentially(email, { delay: 100 });
    await page.getByLabel("Phone").pressSequentially("1234567890", { delay: 100 });
    await page.getByLabel("Current location").click();
    await detectAndHandleCaptcha(page);

    await page.getByLabel("Current location").pressSequentially("New York", { delay: 100 });

    // Verified: Individual result items have the class '.dropdown-location'
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

    // console.log('🔘 Handling Work Authorization...');
    // const workAuthQuestion = page.locator('.application-question').filter({ hasText: 'Do you have the rights to work in country advertised?' });
    // await workAuthQuestion.locator('input[value="Yes"]').click();
}


async function runJobApplication() {
    try {
        const { page } = await connectToBrowser();

        console.log('🌐 Navigating to application page...');
        await page.goto('https://jobs.lever.co/findem/e74f2710-a87c-4532-8cdf-9f5d41ad2e06');

        console.log('🔘 Clicking "Apply for this job"...');
        await page.getByRole('link', { name: 'Apply for this job' }).first().click();

        await detectAndHandleCaptcha(page);

        // 1. Upload Resume First
        // await uploadResume(page, '/Users/consultadd/projects/playwright/resume.txt');

        // 2. Fill Rest of the form
        await fillPersonalDetails(page, 'John', 'Doe', 'john.doe@example.com');
        // await selectLocation(page, 'New');
        // await fillPhoneDetails(page, 'Uni', '12345678900');
        // await fillExperienceDetails(page);
        // await fillEducationDetails(page);

        // await page.getByRole("button", { name: "Next" }).click();
        // await page.waitForTimeout(1000);

        // await fillAdditionalDetails(page);

        console.log('🎉 Automation flow reached the end successfully.');

    } catch (error: any) {
        console.error('❌ Automation Error Occurred');
        console.error('Message:', error.message);
        if (error.stack) {
            console.error('Trace:', error.stack.split('\n').slice(0, 3).join('\n'));
        }
        process.exit(1);
    }
}

// Execute the main script
runJobApplication();