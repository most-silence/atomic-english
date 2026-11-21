-- Atomic English 云同步表。
-- 纪律：本地 Dexie 仍是真相源；这些表只做备份 + 多端同步。
-- RLS 保证一个用户绝对读不到另一个用户的数据（framework-selection §6 的数据隔离要求）。

-- 用户进度：一个用户一条
create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_dates text[] not null default '{}',
  today_play_count integer not null default 0,
  free_translations_left integer not null default 6,
  active_date text not null,
  updated_at timestamptz not null default now()
);

-- 作答流水：追加型，(user_id, challenge_id, created_at) 去重
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id integer not null,
  transcript text not null,
  play_count integer not null default 0,
  accuracy real not null default 0,
  created_at timestamptz not null,
  unique (user_id, challenge_id, created_at)
);
create index if not exists attempts_user_idx on public.attempts(user_id, created_at);

-- 复习词条：SRS 状态，一个用户+题目+词一条
create table if not exists public.review_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_challenge_id integer not null,
  word text not null,
  next_review_at timestamptz not null,
  last_accuracy real not null default 0,
  reviewed_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_challenge_id, word)
);

-- 埋点事件：append-only，走 AnalyticsSink 上报
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);
create index if not exists analytics_user_idx on public.analytics_events(user_id, created_at);

-- RLS：全部按 auth.uid() 隔离
alter table public.progress enable row level security;
alter table public.attempts enable row level security;
alter table public.review_items enable row level security;
alter table public.analytics_events enable row level security;

create policy "progress own" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attempts own" on public.attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review own" on public.review_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "analytics own" on public.analytics_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
