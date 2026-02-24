import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { client } from './agent/openaiClient.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';
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