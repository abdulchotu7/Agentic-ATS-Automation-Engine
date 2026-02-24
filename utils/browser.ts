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
