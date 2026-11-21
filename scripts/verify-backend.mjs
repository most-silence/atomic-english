/**
 * 后端集成验证：直连本地 Supabase 栈，验证 migration / Auth / RLS / 同步读写。
 *
 * 前置：supabase start 已就绪，且 apps/web/.env.local 已填 URL + anon key。
 * 跑法：node scripts/verify-backend.mjs
 *
 * 这是"前后端真的通了"的硬证据，不依赖浏览器。
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ENV_PATH = new URL('../apps/web/.env.local', import.meta.url);
if (!existsSync(ENV_PATH)) {
  console.error('请先创建 apps/web/.env.local（见 .env.example）');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey || anonKey.startsWith('<')) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 未填写');
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };

// 用时间戳造两个独立用户，避免重复运行冲突
const stamp = Date.now();
const emailA = `verify-a-${stamp}@example.com`;
const emailB = `verify-b-${stamp}@example.com`;
const pw = 'Verify12345!';

try {
  // ── 1. 栈可达 ─────────────────────────────────────────────
  const health = await fetch(`${url}/auth/v1/health`);
  check(health.ok, `Supabase Auth 健康端点应可用: ${health.status}`);
  report.steps.push({ step: 'health', status: health.status });

  // ── 2. 注册两个用户 ────────────────────────────────────────
  const { data: signUpA, error: errA } = await supabase.auth.signUp({ email: emailA, password: pw });
  check(!errA && signUpA.user, `用户 A 注册失败: ${errA?.message}`);
  const { data: signUpB, error: errB } = await supabase.auth.signUp({ email: emailB, password: pw });
  check(!errB && signUpB.user, `用户 B 注册失败: ${errB?.message}`);
  report.steps.push({ step: 'signup', a: signUpA.user?.id, b: signUpB.user?.id });

  // 登录 A（拿到 session）
  const { data: loginA, error: loginErr } = await supabase.auth.signInWithPassword({ email: emailA, password: pw });
  check(!loginErr && loginA.session, `用户 A 登录失败: ${loginErr?.message}`);
  const tokenA = loginA.session?.access_token;
  if (!tokenA) throw new Error('没有拿到 A 的 token，后续无法验证');

  // ── 3. 写入数据（带 A 的 token）────────────────────────────
  const authA = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = new Date().toISOString().slice(0, 10);
  const { error: progressErr } = await authA.from('progress').upsert({
    user_id: loginA.user.id,
    completed_dates: [today],
    today_play_count: 3,
    free_translations_left: 4,
    current_date: today,
    updated_at: new Date().toISOString(),
  });
  check(!progressErr, `progress 写入失败: ${progressErr?.message}`);

  const createdAt = new Date().toISOString();
  const { error: attemptErr } = await authA.from('attempts').insert({
    user_id: loginA.user.id,
    challenge_id: 593,
    transcript: 'I start',
    play_count: 2,
    accuracy: 0.125,
    created_at: createdAt,
  });
  check(!attemptErr, `attempts 写入失败: ${attemptErr?.message}`);

  const { error: reviewErr } = await authA.from('review_items').upsert({
    user_id: loginA.user.id,
    source_challenge_id: 593,
    word: 'surfing',
    next_review_at: new Date(Date.now() + 86400000).toISOString(),
    last_accuracy: 0.125,
    reviewed_count: 2,
  });
  check(!reviewErr, `review_items 写入失败: ${reviewErr?.message}`);
  report.steps.push({ step: 'write', tables: ['progress', 'attempts', 'review_items'] });

  // ── 4. 读回验证 ──────────────────────────────────────────
  const { data: progressRow, error: readErr } = await authA.from('progress').select('*').single();
  check(!readErr, `progress 读回失败: ${readErr?.message}`);
  check(progressRow?.completed_dates?.[0] === today, `completed_dates 读回不符: ${JSON.stringify(progressRow)}`);

  const { data: attemptRows } = await authA.from('attempts').select('*');
  check(attemptRows?.length === 1 && attemptRows[0].challenge_id === 593, 'attempts 读回不符');

  const { data: reviewRows } = await authA.from('review_items').select('*');
  check(reviewRows?.length === 1 && reviewRows[0].word === 'surfing', 'review_items 读回不符');
  report.steps.push({ step: 'readback', attempts: attemptRows?.length, reviews: reviewRows?.length });

  // ── 5. RLS 隔离：B 读不到 A 的数据 ─────────────────────────
  const { data: loginB, error: bErr } = await supabase.auth.signInWithPassword({ email: emailB, password: pw });
  check(!bErr && loginB.session, `用户 B 登录失败: ${bErr?.message}`);
  const authB = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${loginB.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: bAttempts } = await authB.from('attempts').select('*');
  check(bAttempts?.length === 0, `RLS 失败：B 读到了 A 的作答 ${bAttempts?.length} 条`);
  const { data: bProgress } = await authB.from('progress').select('*');
  check(bProgress === null, `RLS 失败：B 读到了 A 的进度 ${JSON.stringify(bProgress)}`);
  report.steps.push({ step: 'rls', bAttempts: bAttempts?.length, bProgress });

  // ── 6. 幂等：重复插入同一 attempt 应被 unique 约束挡住 ──────
  const { error: dupErr } = await authA.from('attempts').insert({
    user_id: loginA.user.id,
    challenge_id: 593,
    transcript: 'I start',
    play_count: 2,
    accuracy: 0.125,
    created_at: createdAt,
  });
  check(Boolean(dupErr), '重复 attempt 应被 unique 约束拒绝（保证同步幂等）');
  report.steps.push({ step: 'idempotency', rejected: Boolean(dupErr) });
} catch (err) {
  fail.push(`未捕获异常: ${err instanceof Error ? err.message : String(err)}`);
}

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.error('\n验证失败:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\n后端集成验证通过：栈可达 / 注册登录 / 三表读写 / RLS 隔离 / 幂等');
