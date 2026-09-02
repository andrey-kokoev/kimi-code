import { writeFile } from 'node:fs/promises';

import { expect, test, type Page, type TestInfo } from '@playwright/test';

const SESSION_ID = 'session_browser_structured';
const FIXED_NOW = Date.parse('2025-01-02T03:04:05.000Z');
const DETAILS = {
  kind: 'rows',
  columns: ['id', 'label'],
  rows: [[1, 'Moon']],
};

const sessionSummary = {
  sessionId: SESSION_ID,
  sessionDir: '/fixtures/sessions/session_browser_structured',
  workDir: '/workspace/moon-app',
  title: 'Structured result review',
  lastPrompt: 'Inspect the structured lookup result',
  isCustomTitle: true,
  createdAt: FIXED_NOW - 90 * 60_000,
  updatedAt: FIXED_NOW - 2 * 60_000,
  agentCount: 2,
  mainAgentExists: true,
  mainWireRecordCount: 8,
  wireProtocolVersion: '1.0',
  health: 'ok',
  imported: false,
  importMeta: null,
};

const sessionDetail = {
  sessionId: SESSION_ID,
  sessionDir: sessionSummary.sessionDir,
  workDir: sessionSummary.workDir,
  state: {
    title: sessionSummary.title,
    lastPrompt: sessionSummary.lastPrompt,
    updatedAt: new Date(sessionSummary.updatedAt).toISOString(),
  },
  agents: [
    {
      agentId: 'main',
      type: 'main',
      parentAgentId: null,
      homedir: `${sessionSummary.sessionDir}/agents/main`,
      wireExists: true,
      wireRecordCount: sessionSummary.mainWireRecordCount,
      wireProtocolVersion: '1.0',
      swarmItem: null,
    },
    {
      agentId: 'agent-reviewer',
      type: 'sub',
      parentAgentId: 'main',
      homedir: `${sessionSummary.sessionDir}/agents/agent-reviewer`,
      wireExists: true,
      wireRecordCount: 2,
      wireProtocolVersion: '1.0',
      swarmItem: 'Check structured result rendering',
    },
  ],
  imported: false,
  importMeta: null,
};

function wireEntry(lineNo: number, data: Record<string, unknown>) {
  return { lineNo, data, raw: structuredClone(data) };
}

const records = [
  wireEntry(1, {
    type: 'metadata',
    protocol_version: '1.0',
    created_at: FIXED_NOW - 90 * 60_000,
  }),
  wireEntry(2, {
    type: 'turn.prompt',
    time: FIXED_NOW - 60_000,
    input: [{ type: 'text', text: 'Inspect the structured lookup result' }],
    origin: { kind: 'user' },
  }),
  wireEntry(3, {
    type: 'context.append_loop_event',
    time: FIXED_NOW - 55_000,
    event: {
      type: 'step.begin',
      uuid: 'step-browser-1',
      turnId: '0',
      step: 0,
    },
  }),
  wireEntry(4, {
    type: 'context.append_loop_event',
    time: FIXED_NOW - 50_000,
    event: {
      type: 'content.part',
      uuid: 'content-browser-1',
      turnId: '0',
      step: 0,
      stepUuid: 'step-browser-1',
      part: { type: 'text', text: 'I will look up the moon.' },
    },
  }),
  wireEntry(5, {
    type: 'context.append_loop_event',
    time: FIXED_NOW - 45_000,
    event: {
      type: 'tool.call',
      uuid: 'call-browser-1',
      turnId: '0',
      step: 0,
      stepUuid: 'step-browser-1',
      toolCallId: 'call-browser-structured',
      name: 'StructuredLookup',
      args: { query: 'moon' },
    },
  }),
  wireEntry(6, {
    type: 'context.append_loop_event',
    time: FIXED_NOW - 42_000,
    event: {
      type: 'tool.result',
      parentUuid: 'call-browser-1',
      toolCallId: 'call-browser-structured',
      result: {
        output: 'rows returned',
        details: DETAILS,
        isError: false,
      },
    },
  }),
  wireEntry(7, {
    type: 'context.append_loop_event',
    time: FIXED_NOW - 40_000,
    event: {
      type: 'step.end',
      uuid: 'step-browser-1',
      turnId: '0',
      step: 0,
      finishReason: 'end_turn',
      usage: {
        inputOther: 120,
        output: 24,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      },
    },
  }),
  wireEntry(8, {
    type: 'context.append_message',
    time: FIXED_NOW - 38_000,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'The lookup returned one row.' }],
      toolCalls: [],
    },
  }),
];

const wireResponse = {
  sessionId: SESSION_ID,
  agentId: 'main',
  protocolVersion: '1.0',
  metadata: {
    protocolVersion: '1.0',
    createdAt: FIXED_NOW - 90 * 60_000,
  },
  records,
  warnings: [],
};

const contextResponse = {
  sessionId: SESSION_ID,
  agentId: 'main',
  messages: [
    {
      lineNo: 2,
      time: FIXED_NOW - 60_000,
      source: 'append_message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Inspect the structured lookup result' }],
        toolCalls: [],
        origin: { kind: 'user' },
      },
      toolStepUuids: [],
    },
    {
      lineNo: 3,
      time: FIXED_NOW - 55_000,
      source: 'append_message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'I will look up the moon.' }],
        toolCalls: [
          {
            type: 'function',
            id: 'call-browser-structured',
            name: 'StructuredLookup',
            arguments: '{"query":"moon"}',
          },
        ],
      },
      toolStepUuids: ['step-browser-1'],
    },
    {
      lineNo: 6,
      time: FIXED_NOW - 42_000,
      source: 'append_message',
      message: {
        role: 'tool',
        content: [{ type: 'text', text: 'rows returned' }],
        toolCalls: [],
        toolCallId: 'call-browser-structured',
      },
      toolStepUuids: [],
    },
  ],
  usage: {
    byScope: {
      session: { inputOther: 120, output: 24, inputCacheRead: 0, inputCacheCreation: 0 },
      turn: { inputOther: 120, output: 24, inputCacheRead: 0, inputCacheCreation: 0 },
    },
    byModel: { 'moonshot-v1': { inputOther: 120, output: 24, inputCacheRead: 0, inputCacheCreation: 0 } },
  },
  contextTokens: 144,
  config: { cwd: '/workspace/moon-app', modelAlias: 'moonshot-v1' },
  permission: { mode: null },
  planMode: { active: false },
  goal: null,
  swarm: { active: false },
};

async function installApiFixtures(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  await page.route('**/fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/fonts.gstatic.com/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = async (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (path === '/api/sessions') return json({ sessions: [sessionSummary] });
    if (path === `/api/sessions/${SESSION_ID}`) return json(sessionDetail);
    if (path === `/api/sessions/${SESSION_ID}/wire`) return json(wireResponse);
    if (path === `/api/sessions/${SESSION_ID}/context`) return json(contextResponse);
    if (path === `/api/sessions/${SESSION_ID}/tasks`) {
      return json({ sessionId: SESSION_ID, tasks: [] });
    }
    if (path === `/api/sessions/${SESSION_ID}/cron`) {
      return json({ sessionId: SESSION_ID, cron: [] });
    }

    unexpected.push(`${route.request().method()} ${path}`);
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unhandled fixture route: ${path}` }),
    });
  });
  return unexpected;
}

async function attachPageSnapshots(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(`${name}.png`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
  const aria = await page.locator('body').ariaSnapshot();
  const ariaPath = testInfo.outputPath(`${name}.aria.yml`);
  await writeFile(ariaPath, aria, 'utf8');
  await testInfo.attach(`${name}.aria.yml`, {
    path: ariaPath,
    contentType: 'text/plain',
  });
}

test('renders a structured wire result in a real Chromium page', async ({ page }, testInfo) => {
  await page.addInitScript((now) => {
    window.localStorage.setItem('vis.theme', 'dark');
    Date.now = () => now;
  }, FIXED_NOW);
  const unexpected = await installApiFixtures(page);

  await page.goto('/');
  await expect(page).toHaveTitle('kimi vis');
  await expect(page.getByText('select a session from the left rail to begin inspecting', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Structured result review/ })).toBeVisible();
  await attachPageSnapshots(page, testInfo, 'session-list-page');

  await page.getByRole('link', { name: /Structured result review/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION_ID}`));
  await expect(page.getByText('Structured result review', { exact: true })).toBeVisible();
  await expect(page.getByText('tool.result', { exact: true })).toBeVisible();

  const resultRow = page.locator('button').filter({ hasText: 'tool.result' }).first();
  await resultRow.click();
  await expect(page.getByText('rows returned', { exact: true })).toBeVisible();

  const rawToggle = page.getByRole('button', { name: '[ {…} raw ]' });
  await expect(rawToggle).toBeVisible();
  await rawToggle.click();

  const resultObject = page.getByRole('button', { name: /result.*\{3\}/ });
  await expect(resultObject).toHaveCount(1);
  await resultObject.click();
  const detailsObject = page.getByRole('button', { name: /details.*\{3\}/ });
  await expect(detailsObject).toHaveCount(1);
  await detailsObject.click();
  const rowsObject = page.getByRole('button', { name: /rows.*\[1\]/ });
  await expect(rowsObject).toHaveCount(1);
  await rowsObject.click();
  const firstRowObject = page.getByRole('button', { name: /0.*\[2\]/ });
  await expect(firstRowObject).toHaveCount(1);
  await firstRowObject.click();
  await expect(page.getByText('"Moon"', { exact: true })).toBeVisible();

  await attachPageSnapshots(page, testInfo, 'structured-wire-page');

  await page.getByRole('button', { name: 'Context' }).click();
  await expect(page.getByText('I will look up the moon.', { exact: true })).toBeVisible();
  await expect(page.getByText('rows returned', { exact: true })).toBeVisible();
  await attachPageSnapshots(page, testInfo, 'context-page');

  expect(unexpected).toEqual([]);
});
