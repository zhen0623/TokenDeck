#!/usr/bin/env node
/*
 * usage-proxy.mjs — OpenAI 兼容记账代理（原型）
 *
 * 存在理由：token 用量只出现在「响应的 usage 字段」里，而厂商不开放历史查询。
 * 任何人想拿到用量，就必须站在请求路径上。中间商能显示用量不是有特权，
 * 是它转发了那次请求。这个代理做同一件事，但只在本机、只记账给用户自己看。
 *
 * 用法：
 *   UPSTREAM_BASE=https://open.bigmodel.cn/api/paas/v4 \
 *   UPSTREAM_KEY_FILE=~/.openclaw/glm.key \
 *   PORT=5411 node usage-proxy.mjs
 *
 * 客户端把 base_url 指到 http://127.0.0.1:5411/v1 即可，模型名照旧。
 *
 * 关键设计：
 *   1. 请求体里强制注入 stream_options.include_usage —— 流式响应默认不带 usage，
 *      不注入就永远统计不到流式调用（这是记账类工具的普遍漏洞）。
 *   2. 流式响应边转发边解析 SSE，从末尾 chunk 取 usage，不影响客户端收流。
 *   3. 密钥只从文件读，进程参数与日志中都不出现。
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { URL } from 'node:url';

const UPSTREAM_BASE = (process.env.UPSTREAM_BASE || '').replace(/\/+$/, '');
const KEY_FILE = process.env.UPSTREAM_KEY_FILE || '';
const PORT = Number(process.env.PORT || 5411);

if (!UPSTREAM_BASE) {
  console.error('缺少 UPSTREAM_BASE');
  process.exit(1);
}

const UPSTREAM_KEY = KEY_FILE ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '';
if (KEY_FILE && UPSTREAM_KEY.length < 20) {
  console.error('密钥文件内容异常（过短），拒绝启动');
  process.exit(1);
}

/* ------------------------------------------------------------------ 账本 */

const ledger = {
  startedAt: new Date().toISOString(),
  totals: { requests: 0, prompt: 0, completion: 0, total: 0, cached: 0, reasoning: 0 },
  byModel: Object.create(null),
  byKey: Object.create(null),
  recent: [],
};

function record({ model, usage, keyLabel, path, ms, ok }) {
  const p = Number(usage?.prompt_tokens ?? 0);
  const c = Number(usage?.completion_tokens ?? 0);
  const t = Number(usage?.total_tokens ?? p + c);
  const cached = Number(usage?.prompt_tokens_details?.cached_tokens ?? 0);
  const reasoning = Number(usage?.completion_tokens_details?.reasoning_tokens ?? 0);

  ledger.totals.requests += 1;
  ledger.totals.prompt += p;
  ledger.totals.completion += c;
  ledger.totals.total += t;
  ledger.totals.cached += cached;
  ledger.totals.reasoning += reasoning;

  const m = (ledger.byModel[model || '(unknown)'] ??= {
    requests: 0, prompt: 0, completion: 0, total: 0, cached: 0, reasoning: 0,
  });
  m.requests += 1;
  m.prompt += p;
  m.completion += c;
  m.total += t;
  m.cached += cached;
  m.reasoning += reasoning;

  const k = (ledger.byKey[keyLabel] ??= { requests: 0, total: 0 });
  k.requests += 1;
  k.total += t;

  const entry = {
    at: new Date().toISOString(),
    model: model || '(unknown)',
    path,
    ok,
    ms,
    prompt: p, completion: c, total: t, cached, reasoning,
    /* 用途标签：从请求体 user 字段取，便于按项目/人分组 */
    tag: null,
  };
  ledger.recent.unshift(entry);
  if (ledger.recent.length > 200) ledger.recent.length = 200;
  return entry;
}

/* ------------------------------------------------------------- 上游请求 */

function forward(path, body, headers, onDone) {
  const url = new URL(UPSTREAM_BASE + path);
  const payload = body ? JSON.stringify(body) : null;
  const outHeaders = {
    'content-type': 'application/json',
    accept: headers.accept || 'application/json',
  };
  /* 密钥优先用服务端配置的，避免客户端改动 Key；没有配置才透传 */
  const clientAuth = headers.authorization || '';
  outHeaders.authorization = UPSTREAM_KEY ? `Bearer ${UPSTREAM_KEY}` : clientAuth;
  if (payload) outHeaders['content-length'] = Buffer.byteLength(payload);

  const req = https.request(
    {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: outHeaders,
    },
    (res) => onDone(res),
  );
  req.on('error', (e) => onDone(null, e));
  if (payload) req.write(payload);
  req.end();
  return req;
}

/* --------------------------------------------------------------- 代理 */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/usage/summary') {
    /* 按总量降序，前端直接渲染即可 */
    const models = Object.entries(ledger.byModel)
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.total - a.total);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...ledger.totals, startedAt: ledger.startedAt, models }, null, 2));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/usage/logs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ledger.recent, null, 2));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, upstream: UPSTREAM_BASE }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '请求体不是合法 JSON' } }));
      return;
    }

    /* 强制让流式响应带上 usage，否则流式调用无法记账 */
    if (body.stream) {
      body.stream_options = { ...(body.stream_options || {}), include_usage: true };
    }

    const started = Date.now();
    const path = url.pathname; // 例如 /chat/completions
    const keyLabel = (req.headers.authorization || 'none').slice(-6);

    forward(path, body, req.headers, (up, err) => {
      if (err || !up) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `上游不可达: ${err?.message || 'unknown'}` } }));
        record({ model: body.model, usage: null, keyLabel, path, ms: Date.now() - started, ok: false });
        return;
      }

      const ct = up.headers['content-type'] || '';
      const isStream = ct.includes('text/event-stream');

      if (!isStream) {
        let buf = '';
        up.on('data', (c) => (buf += c));
        up.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(buf);
          } catch {
            /* 非 JSON（错误页等）照原样返回 */
          }
          record({
            model: json?.model || body.model,
            usage: json?.usage,
            keyLabel, path,
            ms: Date.now() - started,
            ok: up.statusCode < 400,
          });
          res.writeHead(up.statusCode, { 'content-type': ct || 'application/json' });
          res.end(buf);
        });
        return;
      }

      /* 流式：原样转发，同时扫描 SSE 里的 usage */
      res.writeHead(up.statusCode, {
        'content-type': ct,
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      let seenUsage = null;
      let seenModel = null;
      let tail = '';

      up.on('data', (chunk) => {
        res.write(chunk);
        const text = tail + chunk.toString('utf8');
        /* 只保留最后一段，避免跨 chunk 截断导致 JSON 解析失败 */
        tail = text.slice(-4096);
        for (const line of tail.split('\n')) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            if (j.usage) seenUsage = j.usage;
            if (j.model) seenModel = j.model;
          } catch {
            /* 半行 JSON 忽略，下一次 chunk 会补齐 */
          }
        }
      });

      up.on('end', () => {
        res.end();
        record({
          model: seenModel || body.model,
          usage: seenUsage,
          keyLabel, path,
          ms: Date.now() - started,
          ok: true,
        });
      });
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`usage-proxy 已启动 http://127.0.0.1:${PORT}`);
  console.log(`上游 ${UPSTREAM_BASE}`);
  console.log(`鉴权 ${UPSTREAM_KEY ? '服务端密钥（客户端无需携带）' : '透传客户端 Authorization'}`);
});
