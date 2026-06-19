const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_URL = 'https://libscope2.netlify.app/';
const TARGET_URL = process.env.VISUAL_VERIFY_URL || process.argv[2] || DEFAULT_URL;
const REPORT_PATH = process.env.VISUAL_VERIFY_REPORT_PATH
  ? path.resolve(process.env.VISUAL_VERIFY_REPORT_PATH)
  : null;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Chrome 또는 Edge 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정해 주세요.');
  }
  return found;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function launchChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libscope-visual-'));
  const chrome = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--window-size=1365,900',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  return { chrome, userDataDir };
}

function writeReport(report) {
  if (!REPORT_PATH) return;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
}

function stopChrome(chrome) {
  return new Promise(resolve => {
    if (chrome.killed || chrome.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 3000);
    chrome.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    chrome.kill();
  });
}

async function removeDirWithRetry(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(`임시 Chrome 프로필 정리에 실패했습니다: ${dir}`);
        return;
      }
      await wait(300);
    }
  }
}

function waitForDevToolsUrl(chrome) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools endpoint 대기 시간이 초과되었습니다.')), 15000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    chrome.stderr.on('data', onData);
    chrome.stdout.on('data', onData);
    chrome.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chrome이 검증 전 종료되었습니다. code=${code}`));
    });
  });
}

async function createCdpClient(browserWsUrl) {
  if (typeof WebSocket !== 'function') {
    throw new Error('현재 Node 런타임에 WebSocket이 없습니다. Node 22 이상에서 실행해 주세요.');
  }

  const baseUrl = browserWsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  const tabInfo = await fetch(`${baseUrl}/json/new`, { method: 'PUT' }).then(res => res.json());
  const ws = new WebSocket(tabInfo.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      logs.push({
        level: message.params.type,
        text: (message.params.args || []).map(arg => arg.value || arg.description || '').join(' ')
      });
    }
    if (message.method === 'Runtime.exceptionThrown') {
      logs.push({
        level: 'exception',
        text: message.params.exceptionDetails?.text || message.params.exceptionDetails?.exception?.description || 'Runtime exception'
      });
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });

  return { send, logs, close: () => ws.close() };
}

async function evaluate(client, expression, returnByValue = true) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function waitForReady(client) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const ready = await evaluate(client, `document.readyState === 'complete' && document.body && document.body.innerText.includes('연령대별 인구 분포')`);
    if (ready) return;
    await wait(500);
  }
  throw new Error('인구 시각화 섹션이 제한 시간 안에 표시되지 않았습니다.');
}

async function run() {
  const { chrome, userDataDir } = launchChrome();
  let client;
  try {
    const browserWsUrl = await waitForDevToolsUrl(chrome);
    client = await createCdpClient(browserWsUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await client.send('Page.setViewport', {}).catch(() => {});
    await client.send('Page.navigate', { url: TARGET_URL });
    await waitForReady(client);
    await wait(2500);

    await evaluate(client, `
      (() => {
        const heading = [...document.querySelectorAll('h4')].find(el => el.textContent?.includes('연령대별 인구 분포'));
        heading?.closest('.bg-white')?.scrollIntoView({ block: 'center', inline: 'nearest' });
        return true;
      })()
    `);
    await wait(700);

    const before = await evaluate(client, `
      (() => {
        const text = document.body.innerText;
        return {
          canvasCount: document.querySelectorAll('canvas').length,
          fallbackCount: [...document.querySelectorAll('*')].filter(el => el.textContent?.includes('표시할 차트 데이터가 없습니다')).length,
          hasResidentTotal: text.includes('552,962'),
          hasPopulationSection: text.includes('연령대별 인구 분포')
        };
      })()
    `);

    await evaluate(client, `
      (() => {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === '생활인구');
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    await wait(1200);

    const after = await evaluate(client, `
      (() => {
        const text = document.body.innerText;
        const heading = [...document.querySelectorAll('h4')].find(el => el.textContent?.includes('연령대별 인구 분포'));
        const card = heading?.closest('.bg-white');
        const rect = card?.getBoundingClientRect();
        return {
          canvasCount: document.querySelectorAll('canvas').length,
          fallbackCount: [...document.querySelectorAll('*')].filter(el => el.textContent?.includes('표시할 차트 데이터가 없습니다')).length,
          hasLivingSource: text.includes('행정동 생활인구 추정치'),
          cardRect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
          chartSizes: [...document.querySelectorAll('canvas')].slice(0, 2).map(canvas => {
            const box = canvas.getBoundingClientRect();
            return { width: Math.round(box.width), height: Math.round(box.height) };
          })
        };
      })()
    `);

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), `libscope-visual-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    const relevantLogs = client.logs.filter(log => (
      ['error', 'warning', 'warn', 'exception'].includes(log.level)
      || /Chart render warning|constructor|Failed/i.test(log.text)
    ));
    const failures = [];
    if (!before.hasPopulationSection) failures.push('인구 시각화 섹션을 찾지 못했습니다.');
    if (after.canvasCount < 2) failures.push(`ECharts canvas 수가 부족합니다. canvasCount=${after.canvasCount}`);
    if (after.fallbackCount > 0) failures.push('차트 fallback UI가 표시되었습니다.');
    if (!after.hasLivingSource) failures.push('생활인구 출처 문구가 표시되지 않았습니다.');
    if (relevantLogs.length > 0) failures.push(`콘솔 경고/오류가 있습니다. count=${relevantLogs.length}`);

    const report = {
      ok: failures.length === 0,
      url: TARGET_URL,
      before,
      after,
      relevantLogs,
      screenshotPath
    };

    writeReport(report);

    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    client?.close();
    await stopChrome(chrome);
    await removeDirWithRetry(userDataDir);
  }
}

run().catch(error => {
  writeReport({
    ok: false,
    url: TARGET_URL,
    error: error.message,
    stack: error.stack
  });
  console.error(error.stack || error.message);
  process.exit(1);
});
