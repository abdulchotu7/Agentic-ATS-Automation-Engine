import type { Page } from 'playwright';
import type { ProfileData } from '../types.ts';
import { connectToBrowser, runWithErrorHandler } from '../utils/browser.ts';
import { runMcpAgent } from '../agent/mcpAgent.ts';

/**
 * Exported handler for unknown/custom ATS sites.
 * Uses the MCP agent (OpenAI Agents SDK + Playwright MCP) as a universal fallback
 * to handle any job application form, regardless of platform.
 */
export async function runCustomSite(page: Page, jobUrl: string, profile: ProfileData, resumePath: string): Promise<void> {
    console.log('🌐 Navigating to application page...');
    await page.goto(jobUrl);
    await page.waitForTimeout(2000);

    console.log('🤖 Handing off to MCP agent for all fields + submit...');
    await runMcpAgent(page);
}

// ── Standalone mode (run directly) ──────────────────────────────────────────
if (process.argv[1]?.endsWith('custom_site.ts')) {
    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const url = process.argv[2] || 'https://careers.adobe.com/us/en/job/ADOBUSR159047EXTERNALENUS/Software-Development-Engineer';
        await runCustomSite(page, url, {} as ProfileData, '');
    });
}