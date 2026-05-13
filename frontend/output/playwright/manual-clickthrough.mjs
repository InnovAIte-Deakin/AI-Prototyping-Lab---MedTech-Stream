import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightImport = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
  : 'playwright';
const playwright = await import(playwrightImport);
const { chromium } = playwright.chromium ? playwright : playwright.default;

const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const outDir = path.resolve('output/playwright/manual-clickthrough');
const runId = Date.now();
const password = 'QaPassword123!';
const patientEmail = `qa.patient.browser.${runId}@example.com`;
const clinicianEmail = `qa.clinician.browser.${runId}@example.com`;
const labTextA = [
  'Hemoglobin 10.5 g/dL 12-16 L',
  'Glucose 145 mg/dL 70-99 H',
  'Creatinine 0.9 mg/dL 0.6-1.2',
].join('\n');
const labTextB = [
  'Hemoglobin 11.4 g/dL 12-16 L',
  'Glucose 120 mg/dL 70-99 H',
  'Creatinine 0.8 mg/dL 0.6-1.2',
].join('\n');

await fs.mkdir(outDir, { recursive: true });

const results = [];
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await context.addInitScript(() => {
  window.__printCalls = 0;
  window.print = () => {
    window.__printCalls += 1;
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        window.__lastCopiedText = text;
      },
    },
  });
});

const page = await context.newPage();
const browserEvents = [];
page.on('pageerror', (error) => browserEvents.push({ type: 'pageerror', message: error.message }));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    browserEvents.push({ type: `console:${message.type()}`, message: message.text() });
  }
});
page.on('requestfailed', (request) => {
  browserEvents.push({
    type: 'requestfailed',
    url: request.url(),
    failure: request.failure()?.errorText || 'unknown',
  });
});

async function step(name, fn) {
  const started = Date.now();
  try {
    const data = await fn();
    results.push({ name, status: 'passed', durationMs: Date.now() - started, data: data || null });
  } catch (error) {
    const screenshot = path.join(outDir, `${String(results.length + 1).padStart(2, '0')}-${slug(name)}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    results.push({
      name,
      status: 'failed',
      durationMs: Date.now() - started,
      error: error?.message || String(error),
      screenshot,
    });
  }
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectText(text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function expectUrlContains(fragment, timeout = 15000) {
  await page.waitForURL((url) => url.href.includes(fragment), { timeout });
}

async function clickButton(name, options = {}) {
  const locator = name instanceof RegExp
    ? page.getByRole('button', { name })
    : page.getByRole('button', { name, exact: true });
  await locator.first().click({ timeout: options.timeout || 15000 });
}

async function goto(pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
}

async function logoutIfPresent() {
  const logout = page.getByRole('button', { name: /^Logout$/ });
  if (await logout.count()) {
    await logout.first().click();
    await expectUrlContains('/auth/login');
  }
}

async function registerUser(email, role) {
  const roleLabel = {
    patient: 'Patient',
    caregiver: 'Caregiver',
    clinician: 'Clinician',
  }[role];
  await goto('/auth/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('.auth-role-label').filter({ hasText: roleLabel }).click();
  const checkedRole = await page.locator('input[name="role"]:checked').evaluate((element) => element.value);
  assert(checkedRole === role, `Expected selected role ${role}, got ${checkedRole}`);
  await clickButton('Create account');
  await expectUrlContains('/parse', 25000);
  await expectText('Upload Your Report');
}

async function loginUser(email) {
  await goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickButton('Sign in');
  await expectUrlContains('/parse', 25000);
  await expectText('Upload Your Report');
}

async function parseTextReport(text) {
  await goto('/parse');
  await page.locator('textarea.report-textarea').fill(text);
  await clickButton('Process Text Summary', { timeout: 30000 });
  await expectText('Biomarker Analysis', 60000);
  const rowCount = await page.locator('table.lab-table tbody tr').count();
  assert(rowCount >= 3, `Expected at least 3 parsed rows, got ${rowCount}`);
}

let reportUrl = '';

await step('home header and public navigation buttons', async () => {
  await goto('/');
  await expectText('Understand Your');
  await page.getByRole('button', { name: /Switch to .* mode|Toggle theme/ }).click();
  await page.getByRole('button', { name: /^Health Check$/ }).click();
  await expectUrlContains('/health');
  await expectText('Status:');
  await page.getByRole('link', { name: /ReportX/ }).click();
  await expectUrlContains('/');
  await page.getByRole('button', { name: /^Review My Report$/ }).first().click();
  await expectUrlContains('/parse');
  await expectText('Upload Your Report');
  await goto('/');
  await page.getByRole('button', { name: /^My Reports$/ }).click();
  await expectUrlContains('/auth/login');
});

await step('forgot password form and login/register links', async () => {
  await goto('/auth/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expectUrlContains('/auth/forgot-password');
  await page.getByLabel('Email address').fill(`missing.${runId}@example.com`);
  await clickButton('Send reset link');
  await expectText('If an account exists');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expectUrlContains('/auth/login');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expectUrlContains('/auth/register');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expectUrlContains('/auth/login');
});

await step('register clinician through UI and logout', async () => {
  await registerUser(clinicianEmail, 'clinician');
  await logoutIfPresent();
});

await step('register patient through UI', async () => {
  await registerUser(patientEmail, 'patient');
});

await step('parse page file upload controls and validation', async () => {
  await goto('/parse');
  const input = page.locator('#file-upload');
  await input.setInputFiles({
    name: 'unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('plain text is not an allowed file upload'),
  });
  await expectText('Only PDF, PNG, or JPEG files are supported.');
  await input.setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expectText('sample.png');
  await page.getByLabel('Remove sample.png').click();
  await expectText('Paste Text');
});

await step('parse pasted text, explain, translation fallback, copy, and print', async () => {
  await parseTextReport(labTextA);
  await clickButton('Explain');
  await expectText('Insights', 60000);
  await page.getByLabel('Translate summary').selectOption('es');
  await expectText('Translation failed', 30000);
  await page.getByLabel('Translate summary').selectOption('en');
  await clickButton('Copy');
  await expectText('Copied');
  await clickButton('Download PDF');
  const printCalls = await page.evaluate(() => window.__printCalls || 0);
  assert(printCalls >= 1, 'Download PDF did not call window.print()');
  await page.screenshot({ path: path.join(outDir, 'parse-insights.png'), fullPage: true });
});

await step('create second parsed report through UI for report history trends', async () => {
  await clickButton('Clear All');
  await parseTextReport(labTextB);
});

await step('reports history controls, search, sort, trend buttons, and open detail', async () => {
  await page.getByRole('button', { name: /^My Reports$/ }).click();
  await expectUrlContains('/reports');
  await expectText('My Report History');
  await page.getByLabel('Search reports').fill('Report');
  await page.getByRole('button', { name: /Sort by report date/ }).click();
  await page.getByRole('button', { name: /Sort by report date/ }).click();
  const biomarkerSelect = page.getByLabel('Select biomarker').first();
  if (await biomarkerSelect.count()) {
    const options = await biomarkerSelect.locator('option').count();
    if (options > 1) await biomarkerSelect.selectOption({ index: 1 });
  }
  await page.getByRole('button', { name: '1 Year' }).click();
  await page.getByRole('button', { name: '6 Months' }).click();
  await page.getByRole('button', { name: 'View Recommendations' }).click();
  await page.locator('button[aria-label^="Open report"]').first().click();
  await page.waitForURL((url) => /\/reports\/[^/]+$/.test(url.pathname), { timeout: 15000 });
  reportUrl = page.url();
  await expectText('Share with Your Clinician');
});

await step('report detail interpretation sidebar, chat, export, and patient question thread', async () => {
  await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
  await expectText('Share with Your Clinician');
  await page.locator('button[aria-label="Review My Report"]').click();
  await expectText('AI Interpretation', 60000);
  await page.locator('textarea.interp-chat-input').fill('What should I ask my clinician?');
  await clickButton('Send');
  await expectText('What should I ask my clinician?');
  await page.getByLabel('Close interpretation panel').click();
  await page.evaluate(() => { window.__printCalls = 0; });
  await page.locator('#export-doctor-summary-btn').click();
  const printCalls = await page.evaluate(() => window.__printCalls || 0);
  assert(printCalls >= 1, 'Export PDF did not call window.print()');
  await page.pdf({ path: path.join(outDir, 'doctor-summary-print.pdf'), format: 'A4', printBackground: true });
  await expectText('Questions for My Clinician', 30000);
  await page.getByRole('button', { name: '+ Ask something else (Free text)' }).click();
  await page.locator('textarea').last().fill('Can we discuss my glucose trend?');
  await clickButton('Send to Clinician');
  await expectText('Conversations', 30000);
  await page.locator('input[placeholder="Type a reply..."]').fill('Adding a patient follow-up reply.');
  await clickButton('Reply');
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder="Type a reply..."]');
    return input && input.value === '';
  });
});

await step('share report from detail page with clinician and include doctor summary print', async () => {
  await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
  await expectText('Share with Your Clinician');
  await page.locator('#clinician-email').fill(clinicianEmail);
  await page.locator('#share-scope').selectOption('full');
  await page.locator('#include-summary-pdf').check();
  await page.evaluate(() => { window.__printCalls = 0; });
  await clickButton('Start Sharing');
  await expectText('Sharing preferences updated.', 30000);
  await page.waitForTimeout(700);
  const printCalls = await page.evaluate(() => window.__printCalls || 0);
  assert(printCalls >= 1, 'Including doctor summary did not trigger print after sharing');
});

await step('patient notification drawer and notifications page controls', async () => {
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expectText('Recent updates and shared-report activity');
  await clickButton('Mark all read');
  await page.getByRole('button', { name: 'View all notifications' }).click();
  await expectUrlContains('/notifications');
  await clickButton(/^Unread$/);
  await clickButton(/^All$/);
  const typeSelect = page.locator('.notifications-page-toolbar select.input');
  if (await typeSelect.count()) await typeSelect.selectOption('all');
});

await step('clinician login, shared reports dashboard, shared detail, and notification controls', async () => {
  const clinicianContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const clinicianPage = await clinicianContext.newPage();
  try {
    await clinicianPage.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded' });
    await clinicianPage.getByLabel('Email address').fill(clinicianEmail);
    await clinicianPage.getByLabel('Password').fill(password);
    await clinicianPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await clinicianPage.waitForURL((url) => url.href.includes('/parse'), { timeout: 25000 });
    await clinicianPage.getByRole('button', { name: /^Shared Reports$/ }).click();
    await clinicianPage.waitForURL((url) => url.href.includes('/reports/shared'), { timeout: 15000 });
    await clinicianPage.getByText('Shared Reports', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByRole('button', { name: /^Open$/ }).first().click();
    await clinicianPage.waitForURL((url) => /\/reports\/shared\/[^/]+$/.test(url.pathname), { timeout: 15000 });
    await clinicianPage.getByText('Clinical Summary', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByText('Doctor Summary', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByText('Lab Results & Biomarkers', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByText('Conversation Threads', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByText('Clinician Response Template', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByLabel('What the result means:').fill('This pattern can fit recent meals or early glucose intolerance.');
    await clinicianPage.getByLabel('Urgency:').selectOption('soon');
    await clinicianPage.getByLabel('Recommended action:').fill('Book a non-urgent follow-up and repeat fasting labs.');
    await clinicianPage.getByRole('button', { name: 'Submit Clinical Response' }).click();
    await clinicianPage.getByText('Clinician Response', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.screenshot({ path: path.join(outDir, 'clinician-shared-detail.png'), fullPage: true });
    await clinicianPage.getByRole('link', { name: 'Shared Reports' }).first().click();
    await clinicianPage.waitForURL((url) => url.href.includes('/reports/shared'), { timeout: 15000 });
    await clinicianPage.getByRole('button', { name: 'Notifications' }).click();
    await clinicianPage.getByText('Recent updates and shared-report activity', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    await clinicianPage.getByRole('button', { name: 'Mark all read', exact: true }).first().click();
    await clinicianPage.getByRole('button', { name: 'View all notifications', exact: true }).click();
    await clinicianPage.waitForURL((url) => url.href.includes('/notifications'), { timeout: 15000 });
    await clinicianPage.getByRole('button', { name: /^Unread$/ }).click();
    await clinicianPage.getByRole('button', { name: /^All$/ }).click();
  } finally {
    await clinicianContext.close();
  }
});

await step('patient login and revoke share through report detail UI', async () => {
  await page.bringToFront();
  await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#clinician-email').fill(clinicianEmail);
  await page.locator('#share-scope').selectOption('full');
  await clickButton('Start Sharing');
  await expectText('Sharing preferences updated.', 30000);
  await clickButton('Revoke Access');
  await expectText('Sharing revoked.', 30000);
  await logoutIfPresent();
});

await page.screenshot({ path: path.join(outDir, 'final-page.png'), fullPage: true }).catch(() => {});

await fs.writeFile(
  path.join(outDir, 'manual-clickthrough-results.json'),
  JSON.stringify(
    {
      baseUrl,
      patientEmail,
      clinicianEmail,
      results,
      browserEvents,
      passed: results.filter((item) => item.status === 'passed').length,
      failed: results.filter((item) => item.status === 'failed').length,
    },
    null,
    2,
  ),
);

await browser.close();

const failed = results.filter((item) => item.status === 'failed');
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, failedSteps: failed }, null, 2));
if (failed.length > 0) process.exit(1);
