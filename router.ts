#!/usr/bin/env npx tsx
/**
 * Job Automation Router
 *
 * Reads the result JSON from job_search_agent.py, matches each job URL
 * to the correct ATS automation handler, and runs them sequentially.
 *
 * Usage:
 *   npx tsx router.ts --result /path/to/result.json [--dry-run] [--limit N]
 */

import { readFileSync } from 'fs';
import type { Page } from 'playwright';
import { connectToBrowser } from './utils/browser.ts';
import type { JobSearchResult, JobEntry, ProfileData, AutomationResult } from './types.ts';

// ── Import automation handlers ──────────────────────────────────────────────
import { runGreenhouse } from './greenhouse.ts';
import { runLever } from './lever.ts';
import { runSmartRecruiters } from './smartrecruiters.ts';
import { runCustomSite } from './custom_site.ts';

// ── URL → Handler mapping ───────────────────────────────────────────────────

type HandlerName = 'greenhouse' | 'lever' | 'smartrecruiters' | 'custom';

interface HandlerConfig {
    name: HandlerName;
    fn: (page: Page, jobUrl: string, profile: ProfileData, resumePath: string) => Promise<void>;
}

const HANDLERS: Record<HandlerName, HandlerConfig> = {
    greenhouse: { name: 'greenhouse', fn: runGreenhouse },
    lever: { name: 'lever', fn: runLever },
    smartrecruiters: { name: 'smartrecruiters', fn: runSmartRecruiters },
    custom: { name: 'custom', fn: runCustomSite },
};

/**
 * Match a job URL to the correct ATS handler based on domain.
 */
function getHandler(url: string): HandlerConfig {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (hostname.includes('greenhouse.io')) return HANDLERS.greenhouse;
        if (hostname.includes('lever.co')) return HANDLERS.lever;
        if (hostname.includes('smartrecruiters.com')) return HANDLERS.smartrecruiters;
        // Workday, BambooHR, Jobvite, iCIMS, Jazz, Workable → all use MCP agent fallback
        return HANDLERS.custom;
    } catch {
        return HANDLERS.custom;
    }
}

// ── Timeout helper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`⏰ Timeout: "${label}" exceeded ${Math.round(ms / 60000)} min limit`));
        }, ms);
        promise
            .then((val) => { clearTimeout(timer); resolve(val); })
            .catch((err) => { clearTimeout(timer); reject(err); });
    });
}

// ── CLI argument parsing ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINS = 10;

function parseArgs(): { resultPath: string; dryRun: boolean; limit: number; timeoutMs: number } {
    const args = process.argv.slice(2);
    let resultPath = '';
    let dryRun = false;
    let limit = Infinity;
    let timeoutMins = DEFAULT_TIMEOUT_MINS;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--result' && args[i + 1]) {
            resultPath = args[++i];
        } else if (args[i] === '--dry-run') {
            dryRun = true;
        } else if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[++i], 10);
        } else if (args[i] === '--timeout' && args[i + 1]) {
            timeoutMins = parseInt(args[++i], 10);
        }
    }

    if (!resultPath) {
        console.error('Usage: npx tsx router.ts --result /path/to/result.json [--dry-run] [--limit N] [--timeout MINS]');
        process.exit(1);
    }

    return { resultPath, dryRun, limit, timeoutMs: timeoutMins * 60 * 1000 };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const { resultPath, dryRun, limit, timeoutMs } = parseArgs();

    // Set env var so profile.ts lazy-loader reads the correct result JSON
    process.env.RESULT_JSON_PATH = resultPath;

    // Load the job search result JSON
    console.log(`📄 Loading result from: ${resultPath}`);
    const raw = readFileSync(resultPath, 'utf-8');
    const data: JobSearchResult = JSON.parse(raw);

    const jobs = data.jobs.slice(0, limit);
    const profile = data.application_data;
    const resumePath = data.resume_input;

    console.log(`\n🔍 Search query: ${data.search_query}`);
    console.log(`📋 Total jobs found: ${data.unique_jobs_count}`);
    console.log(`🎯 Processing: ${jobs.length} job(s)`);
    console.log(`⏱️  Timeout: ${Math.round(timeoutMs / 60000)} min per job\n`);

    // Show routing plan
    console.log('─'.repeat(60));
    console.log('ROUTING PLAN');
    console.log('─'.repeat(60));
    for (const job of jobs) {
        const handler = getHandler(job.url);
        console.log(`  ${handler.name.padEnd(16)} → ${job.title}`);
        console.log(`  ${''.padEnd(16)}   ${job.url}`);
    }
    console.log('─'.repeat(60));

    if (dryRun) {
        console.log('\n🏁 Dry run complete. No browser actions taken.');
        process.exit(0);
    }

    // Connect to browser
    console.log('\n🔗 Connecting to Chrome...');
    const { browser, page: initialPage } = await connectToBrowser();
    const context = initialPage.context();

    const results: AutomationResult[] = [];

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const handler = getHandler(job.url);

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🚀 [${i + 1}/${jobs.length}] ${handler.name.toUpperCase()}: ${job.title}`);
        console.log(`   ${job.url}`);
        console.log('═'.repeat(60));

        // Open each job in a NEW tab — old tabs stay open for cross-checking
        const page = await context.newPage();
        console.log(`📑 Opened new tab for job [${i + 1}/${jobs.length}]`);

        try {
            await handler.fn(page, job.url, profile, resumePath);
            results.push({
                url: job.url,
                title: job.title,
                handler: handler.name,
                status: 'success',
            });
            console.log(`✅ [${i + 1}/${jobs.length}] Completed: ${job.title}`);
            console.log(`📌 Tab kept open for review — check it before the next job starts`);
        } catch (error: any) {
            console.error(`❌ [${i + 1}/${jobs.length}] Failed: ${job.title}`);
            console.error(`   Error: ${error.message}`);
            results.push({
                url: job.url,
                title: job.title,
                handler: handler.name,
                status: 'failed',
                error: error.message,
            });
        }

        // Pause between applications — gives you time to review the tab
        if (i < jobs.length - 1) {
            console.log('\n⏳ Waiting 5s before next application (review the tab now)...');
            await page.waitForTimeout(5000);
        }
    }

    // Summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESULTS SUMMARY');
    console.log('═'.repeat(60));
    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`  ✅ Succeeded: ${succeeded}`);
    console.log(`  ❌ Failed:    ${failed}`);
    console.log('─'.repeat(60));
    for (const r of results) {
        const icon = r.status === 'success' ? '✅' : '❌';
        console.log(`  ${icon} [${r.handler}] ${r.title}`);
        if (r.error) console.log(`     Error: ${r.error}`);
    }
    console.log('═'.repeat(60));
}

main().catch((err) => {
    console.error('❌ Router fatal error:', err.message);
    process.exit(1);
});
