import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';

assertSafeToRunIntegrationTests();
const dataset = loadBrowserDataset();
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await signInForBrowser(client, dataset.identities.admin.email, dataset.password);
  await seedSessionAndReload(page, process.env.SUPABASE_URL, session, '/admin');
  await expect(page.getByRole('button', { name: 'Asset Library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
  await page.locator('.sp-asset-row').first().waitFor();
  const grid = await new AxeBuilder({ page }).analyze();
  const inactive = page.locator('.sp-admin__table tr').filter({ has: page.getByText('Inactive', { exact: true }) }).first();
  const inactiveColors = await inactive.locator('td').first().evaluate(el => ({ color: getComputedStyle(el).color, opacity: getComputedStyle(el.parentElement).opacity }));
  await page.getByRole('button', { name: 'Collaborations', exact: true }).click();
  await page.locator('.sp-collab-report__table td').first().waitFor();
  const result = await new AxeBuilder({ page }).analyze();
  console.log(JSON.stringify([...grid.violations, ...result.violations].map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary, data: n.any.map(c => c.data) })) })), null, 2));
  console.log(await page.locator('.sp-collab-report__table td').first().evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor })));
  console.log('Inactive asset row:', inactiveColors);
  await page.goto('http://localhost:5173/');
  await expect(page.getByRole('link', { name: /ENTER COMMAND CENTER/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /ENTER COMMAND CENTER/i })).toBeVisible();
  console.log('PASS corrected administrator refresh assertion');
  process.exitCode = [...grid.violations, ...result.violations].some(v => ['serious', 'critical'].includes(v.impact)) ? 1 : 0;
} finally { await browser.close(); }
