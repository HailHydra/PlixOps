-- PlixOps Unified Platform Schema
-- Migration: 20261023160000_plix_unified_ops_schema.sql

create extension if not exists pgcrypto;

-- 1. Workspaces & Members
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  initials text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team text not null check (team in ('brand', 'content', 'video', 'performance', 'administrator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- 2. Tasks Table with Hook Name and Removed Target Date constraint
create table if not exists public.tasks (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  hook_name text check (hook_name is null or length(trim(hook_name)) between 1 and 200),
  brand text default 'Plix',
  product text not null,
  campaign text,
  brief_type text not null check (brief_type in ('video', 'ai')),
  source_sheet text,
  category text check (category in ('Hair', 'Skin', 'Nutra', 'Joyun', 'B2G2')),
  content_type text not null,
  priority text not null check (priority in ('P0', 'P1', 'P2', 'R0')),
  state text not null check (state in (
    'draft', 'social_research', 'script_changes_requested', 'script_approval_pending',
    'editing_queue', 'editing_in_progress', 'approval_pending', 'changes_requested',
    'approved', 'ready_for_performance', 'publishing_in_progress',
    'publishing_failed', 'published', 'on_hold', 'blocked', 'cancelled'
  )),
  summary text,
  platform text,
  script_owner_id uuid references auth.users(id) on delete set null,
  editor_id uuid references auth.users(id) on delete set null,
  publisher_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Stage Timing & Turnaround Table
create table if not exists public.task_stage_durations (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage text not null check (stage in (
    'brand_intake', 'content_scripting', 'brand_script_review',
    'video_production', 'brand_video_review', 'perf_publishing', 'published'
  )),
  team text not null check (team in ('brand', 'content', 'video', 'performance', 'administrator')),
  iteration integer not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds integer generated always as (
    case 
      when completed_at is not null then extract(epoch from (completed_at - started_at))::integer
      else null
    end
  ) stored,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. Assets Table
create table if not exists public.task_assets (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_type text not null check (asset_type in ('reference', 'script', 'video', 'drive_link', 'live_link')),
  label text not null,
  url text,
  status text not null default 'provided' check (status in ('provided', 'pending', 'approved', 'changes_requested', 'live')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- 5. Approvals Table
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_type text not null check (approval_type in ('script', 'video', 'publish')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  request_comment text,
  decision_comment text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

-- 6. Team-Scoped Security Definer RBAC
create schema if not exists private;

create or replace function private.can_access_task_state(p_workspace_id uuid, p_state text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team text;
begin
  select team into v_team
  from public.workspace_members
  where workspace_id = p_workspace_id
    and (select auth.uid()) is not null
    and user_id = (select auth.uid())
  limit 1;

  if v_team is null then
    return false;
  end if;

  if v_team in ('administrator', 'brand') then
    return true;
  elsif v_team = 'content' then
    return p_state in ('social_research', 'script_changes_requested', 'script_approval_pending');
  elsif v_team = 'video' then
    return p_state in ('editing_queue', 'editing_in_progress', 'approval_pending', 'changes_requested');
  elsif v_team = 'performance' then
    return p_state in ('ready_for_performance', 'publishing_in_progress', 'publishing_failed', 'published');
  end if;

  return false;
end;
$$;

-- Enable RLS
alter table public.tasks enable row level security;
alter table public.task_assets enable row level security;
alter table public.approvals enable row level security;
alter table public.task_stage_durations enable row level security;

create policy "tasks_team_scoped" on public.tasks
for select to authenticated
using ((select private.can_access_task_state(workspace_id, state)));

create policy "task_assets_team_scoped" on public.task_assets
for select to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_assets.task_id
      and (select private.can_access_task_state(t.workspace_id, t.state))
  )
);

