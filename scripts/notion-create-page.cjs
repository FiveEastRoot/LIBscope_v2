const fs = require('fs');
const path = require('path');

const NOTION_VERSION = '2022-06-28';
const MAX_RICH_TEXT_LENGTH = 1900;
const MAX_INITIAL_BLOCKS = 95;

function loadEnv(envPath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function richText(content) {
  return [{ type: 'text', text: { content: content.slice(0, MAX_RICH_TEXT_LENGTH) } }];
}

function block(type, text) {
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: richText(text)
    }
  };
}

function codeBlock(text) {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: richText(text),
      language: 'plain text'
    }
  };
}

function splitLongText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_RICH_TEXT_LENGTH) {
    chunks.push(text.slice(i, i + MAX_RICH_TEXT_LENGTH));
  }
  return chunks;
}

function markdownToBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let inCode = false;
  let codeLines = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        blocks.push(codeBlock(codeLines.join('\n')));
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('|')) {
      blocks.push(codeBlock(trimmed));
    } else if (trimmed.startsWith('### ')) {
      blocks.push(block('heading_3', trimmed.slice(4)));
    } else if (trimmed.startsWith('## ')) {
      blocks.push(block('heading_2', trimmed.slice(3)));
    } else if (trimmed.startsWith('# ')) {
      blocks.push(block('heading_1', trimmed.slice(2)));
    } else if (trimmed.startsWith('- ')) {
      blocks.push(block('bulleted_list_item', trimmed.slice(2)));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push(block('numbered_list_item', trimmed.replace(/^\d+\.\s+/, '')));
    } else {
      for (const chunk of splitLongText(trimmed)) {
        blocks.push(block('paragraph', chunk));
      }
    }
  }

  if (codeLines.length) {
    blocks.push(codeBlock(codeLines.join('\n')));
  }

  return blocks;
}

async function notionRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Notion API ${response.status}: ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

async function appendBlocks(blockId, blocks) {
  for (let i = 0; i < blocks.length; i += MAX_INITIAL_BLOCKS) {
    const children = blocks.slice(i, i + MAX_INITIAL_BLOCKS);
    await notionRequest(`https://api.notion.com/v1/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children })
    });
  }
}

async function main() {
  loadEnv();

  const args = parseArgs(process.argv);
  const title = args.title;
  const file = args.file;
  const parentPageId = args.parent || process.env.NOTION_PROJECT_PAGE_ID;

  if (!process.env.NOTION_TOKEN) {
    throw new Error('NOTION_TOKEN is missing. Add it to .env.');
  }
  if (!parentPageId) {
    throw new Error('NOTION_PROJECT_PAGE_ID is missing. Add it to .env or pass --parent.');
  }
  if (!title || !file) {
    throw new Error('Usage: npm run notion:create -- --title "Page title" --file docs/page.md');
  }

  const markdownPath = path.resolve(process.cwd(), file);
  const markdown = fs.readFileSync(markdownPath, 'utf-8');
  const blocks = markdownToBlocks(markdown);

  const page = await notionRequest('https://api.notion.com/v1/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: title } }]
        }
      },
      children: blocks.slice(0, MAX_INITIAL_BLOCKS)
    })
  });

  if (blocks.length > MAX_INITIAL_BLOCKS) {
    await appendBlocks(page.id, blocks.slice(MAX_INITIAL_BLOCKS));
  }

  console.log(`Created Notion page: ${page.url}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
