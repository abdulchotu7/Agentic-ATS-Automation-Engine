import 'dotenv/config';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

/**
 * Connects to an existing Chrome browser instance via CDP.
 */
export async function connectToBrowser(cdpUrl: string = "http://localhost:9222/"): Promise<{ browser: Browser, page: Page }> {
    console.log('🔗 Connecting to Chrome...');
    const browser = await chromium.connectOverCDP(cdpUrl);
    const defaultContext = browser.contexts()[0];
    defaultContext.setDefaultTimeout(9000); // 5s instead of 30s default
    const page = await defaultContext.newPage();
    console.log('✅ Connected to browser session.');
    return { browser, page };
}

/**
 * Wraps a job application function with standard error handling.
 */
export async function runWithErrorHandler(fn: () => Promise<void>) {
    try {
        await fn();
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

/**
 * Runs an async step, catching errors so the script continues.
 * The MCP agent will handle anything that fails here.
 */
export async function tryStep(name: string, fn: () => Promise<void>) {
    try {
        await fn();
    } catch (error: any) {
        console.warn(`⚠️ Step "${name}" failed: ${error.message} — MCP agent will handle it.`);
    }
}

/**
 * Fills a text field ONLY if it's currently empty.
 * Returns true if the field was filled, false if it already had a value.
 * This respects auto-fill from resume uploads.
 */
export async function fillIfEmpty(
    locator: any,
    value: string,
    options: { delay?: number; label?: string } = {},
): Promise<boolean> {
    try {
        const current = await locator.inputValue();
        if (current && current.trim().length > 0) {
            console.log(`   ⏭️ ${options.label || 'Field'} already filled: "${current.substring(0, 40)}..."`);
            return false;
        }
    } catch {
        // inputValue might fail on non-input elements — fill anyway
    }
    await locator.pressSequentially(value, { delay: options.delay ?? 100 });
    console.log(`   ✏️ ${options.label || 'Field'} filled: "${value.substring(0, 40)}"`);
    return true;
}
