create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  user_id text not null,
  title text,
  last_message_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations
  add column if not exists tenant_id text not null default 'default';

create index if not exists ai_conversations_tenant_user_updated_idx
  on public.ai_conversations (tenant_id, user_id, updated_at desc);

drop trigger if exists ai_conversations_touch_updated_at on public.ai_conversations;
create trigger ai_conversations_touch_updated_at
before update on public.ai_conversations
for each row execute function public.ai_touch_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id text not null,
  role text not null,
  message jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_messages
  add column if not exists tenant_id text not null default 'default';

create index if not exists ai_messages_conversation_user_created_idx
  on public.ai_messages (tenant_id, user_id, conversation_id, created_at);

create table if not exists public.ai_tool_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id text,
  tool_name text,
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ai_tool_audit
  add column if not exists tenant_id text,
  add column if not exists conversation_id uuid references public.ai_conversations(id) on delete set null,
  add column if not exists user_id text,
  add column if not exists tool_name text;

create index if not exists ai_tool_audit_tenant_user_created_idx
  on public.ai_tool_audit (tenant_id, user_id, created_at desc);

create index if not exists ai_tool_audit_conversation_created_idx
  on public.ai_tool_audit (conversation_id, created_at desc);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id text,
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tool_calls_count integer not null default 0,
  cost_estimate numeric(12, 6) not null default 0,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_events
  add column if not exists tenant_id text,
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0,
  add column if not exists tool_calls_count integer not null default 0,
  add column if not exists cost_estimate numeric(12, 6) not null default 0;

create index if not exists ai_usage_events_tenant_user_created_idx
  on public.ai_usage_events (tenant_id, user_id, created_at desc);

create table if not exists public.ai_rate_limits (
  key text primary key,
  count integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_rate_limits_touch_updated_at on public.ai_rate_limits;
create trigger ai_rate_limits_touch_updated_at
before update on public.ai_rate_limits
for each row execute function public.ai_touch_updated_at();

create or replace function public.ai_check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_cutoff timestamptz;
  v_window_expires_at timestamptz;
  v_count integer;
  v_window_started_at timestamptz;
  v_retry_after integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Rate limit key is required';
  end if;

  if p_limit <= 0 then
    raise exception 'Rate limit must be positive';
  end if;

  if p_window_seconds <= 0 then
    raise exception 'Rate limit window must be positive';
  end if;

  v_window_cutoff := v_now - make_interval(secs => p_window_seconds);

  insert into public.ai_rate_limits as limits (key, count, window_started_at, updated_at)
  values (p_key, 1, v_now, v_now)
  on conflict (key) do update
    set count = case
          when limits.window_started_at < v_window_cutoff then 1
          else limits.count + 1
        end,
        window_started_at = case
          when limits.window_started_at < v_window_cutoff then v_now
          else limits.window_started_at
        end,
        updated_at = v_now
  returning count, window_started_at
  into v_count, v_window_started_at;

  v_window_expires_at := v_window_started_at + make_interval(secs => p_window_seconds);
  v_retry_after := greatest(0, ceiling(extract(epoch from (v_window_expires_at - v_now)))::integer);

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'retry_after', case when v_count <= p_limit then 0 else v_retry_after end
  );
end;
$$;

create table if not exists public.ai_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_settings_touch_updated_at on public.ai_settings;
create trigger ai_settings_touch_updated_at
before update on public.ai_settings
for each row execute function public.ai_touch_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_audit enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_settings enable row level security;

create or replace function public.ai_current_user_id()
returns text
language sql
stable
as $$
  select nullif(coalesce(auth.uid()::text, current_setting('request.jwt.claim.sub', true)), '');
$$;

create or replace function public.ai_current_tenant_id()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    auth.jwt() ->> 'tenant_id',
    auth.jwt() -> 'app_metadata' ->> 'tenant_id',
    auth.jwt() -> 'user_metadata' ->> 'tenant_id',
    auth.jwt() ->> 'tenantId',
    auth.jwt() -> 'app_metadata' ->> 'tenantId',
    auth.jwt() -> 'user_metadata' ->> 'tenantId',
    current_setting('request.jwt.claim.tenant_id', true),
    current_setting('request.jwt.claim.tenantId', true),
    'default'
  ), '');
$$;

create or replace function public.ai_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

drop policy if exists ai_conversations_service_role_all on public.ai_conversations;
create policy ai_conversations_service_role_all
  on public.ai_conversations
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_conversations_authenticated_select on public.ai_conversations;
create policy ai_conversations_authenticated_select
  on public.ai_conversations
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_conversations_authenticated_insert on public.ai_conversations;
create policy ai_conversations_authenticated_insert
  on public.ai_conversations
  for insert
  to authenticated
  with check (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_conversations_authenticated_update on public.ai_conversations;
create policy ai_conversations_authenticated_update
  on public.ai_conversations
  for update
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id())
  with check (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_conversations_authenticated_delete on public.ai_conversations;
create policy ai_conversations_authenticated_delete
  on public.ai_conversations
  for delete
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_messages_service_role_all on public.ai_messages;
create policy ai_messages_service_role_all
  on public.ai_messages
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_messages_authenticated_select on public.ai_messages;
create policy ai_messages_authenticated_select
  on public.ai_messages
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_messages_authenticated_insert on public.ai_messages;
create policy ai_messages_authenticated_insert
  on public.ai_messages
  for insert
  to authenticated
  with check (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_messages_authenticated_update on public.ai_messages;
create policy ai_messages_authenticated_update
  on public.ai_messages
  for update
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id())
  with check (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_messages_authenticated_delete on public.ai_messages;
create policy ai_messages_authenticated_delete
  on public.ai_messages
  for delete
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_tool_audit_service_role_all on public.ai_tool_audit;
create policy ai_tool_audit_service_role_all
  on public.ai_tool_audit
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_tool_audit_authenticated_select on public.ai_tool_audit;
create policy ai_tool_audit_authenticated_select
  on public.ai_tool_audit
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_usage_events_service_role_all on public.ai_usage_events;
create policy ai_usage_events_service_role_all
  on public.ai_usage_events
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_usage_events_authenticated_select on public.ai_usage_events;
create policy ai_usage_events_authenticated_select
  on public.ai_usage_events
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id() and user_id = public.ai_current_user_id());

drop policy if exists ai_rate_limits_service_role_all on public.ai_rate_limits;
create policy ai_rate_limits_service_role_all
  on public.ai_rate_limits
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_settings_service_role_all on public.ai_settings;
create policy ai_settings_service_role_all
  on public.ai_settings
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  name text,
  type text,
  uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_sources_tenant_type_idx
  on public.ai_knowledge_sources (tenant_id, type);

drop trigger if exists ai_knowledge_sources_touch_updated_at on public.ai_knowledge_sources;
create trigger ai_knowledge_sources_touch_updated_at
before update on public.ai_knowledge_sources
for each row execute function public.ai_touch_updated_at();

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  source_id uuid references public.ai_knowledge_sources(id) on delete set null,
  title text,
  uri text,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_documents_tenant_source_idx
  on public.ai_knowledge_documents (tenant_id, source_id);

drop trigger if exists ai_knowledge_documents_touch_updated_at on public.ai_knowledge_documents;
create trigger ai_knowledge_documents_touch_updated_at
before update on public.ai_knowledge_documents
for each row execute function public.ai_touch_updated_at();

create table if not exists public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  source_id uuid references public.ai_knowledge_sources(id) on delete set null,
  document_id uuid references public.ai_knowledge_documents(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_chunks_tenant_document_idx
  on public.ai_knowledge_chunks (tenant_id, document_id, chunk_index);

create index if not exists ai_knowledge_chunks_metadata_idx
  on public.ai_knowledge_chunks using gin (metadata);

create index if not exists ai_knowledge_chunks_embedding_idx
  on public.ai_knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

drop trigger if exists ai_knowledge_chunks_touch_updated_at on public.ai_knowledge_chunks;
create trigger ai_knowledge_chunks_touch_updated_at
before update on public.ai_knowledge_chunks
for each row execute function public.ai_touch_updated_at();

alter table public.ai_knowledge_sources enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_knowledge_chunks enable row level security;

drop policy if exists ai_knowledge_sources_service_role_all on public.ai_knowledge_sources;
create policy ai_knowledge_sources_service_role_all
  on public.ai_knowledge_sources
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_knowledge_sources_authenticated_read on public.ai_knowledge_sources;
create policy ai_knowledge_sources_authenticated_read
  on public.ai_knowledge_sources
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id());

drop policy if exists ai_knowledge_documents_service_role_all on public.ai_knowledge_documents;
create policy ai_knowledge_documents_service_role_all
  on public.ai_knowledge_documents
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_knowledge_documents_authenticated_read on public.ai_knowledge_documents;
create policy ai_knowledge_documents_authenticated_read
  on public.ai_knowledge_documents
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id());

drop policy if exists ai_knowledge_chunks_service_role_all on public.ai_knowledge_chunks;
create policy ai_knowledge_chunks_service_role_all
  on public.ai_knowledge_chunks
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_knowledge_chunks_authenticated_read on public.ai_knowledge_chunks;
create policy ai_knowledge_chunks_authenticated_read
  on public.ai_knowledge_chunks
  for select
  to authenticated
  using (tenant_id = public.ai_current_tenant_id());

create or replace function public.ai_match_knowledge(
  p_tenant_id text,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 10,
  p_match_threshold double precision default 0,
  p_filters jsonb default '{}'::jsonb
)
returns table (
  chunk_id text,
  content text,
  document_id text,
  document_title text,
  document_uri text,
  source_id text,
  source_name text,
  source_type text,
  source_uri text,
  score double precision,
  metadata jsonb,
  chunk_metadata jsonb,
  document_metadata jsonb,
  source_metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_match_count, 10), 1), 100);
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_metadata_filters jsonb := coalesce(p_filters, '{}'::jsonb)
    - array['source_id', 'source_type', 'document_id', 'document_uri'];
begin
  if p_tenant_id is null or length(trim(p_tenant_id)) = 0 then
    raise exception 'Knowledge tenant_id is required';
  end if;

  if not public.ai_is_service_role() and p_tenant_id <> public.ai_current_tenant_id() then
    raise exception 'Knowledge tenant is not allowed';
  end if;

  return query
  select
    chunks.id::text as chunk_id,
    chunks.content,
    documents.id::text as document_id,
    documents.title as document_title,
    documents.uri as document_uri,
    sources.id::text as source_id,
    sources.name as source_name,
    sources.type as source_type,
    sources.uri as source_uri,
    1 - (chunks.embedding <=> p_query_embedding) as score,
    jsonb_build_object('tenant_id', chunks.tenant_id) as metadata,
    chunks.metadata as chunk_metadata,
    coalesce(documents.metadata, '{}'::jsonb) as document_metadata,
    coalesce(sources.metadata, '{}'::jsonb) as source_metadata
  from public.ai_knowledge_chunks chunks
  left join public.ai_knowledge_documents documents
    on documents.id = chunks.document_id
    and documents.tenant_id = chunks.tenant_id
  left join public.ai_knowledge_sources sources
    on sources.id = chunks.source_id
    and sources.tenant_id = chunks.tenant_id
  where chunks.tenant_id = p_tenant_id
    and chunks.embedding is not null
    and 1 - (chunks.embedding <=> p_query_embedding) >= coalesce(p_match_threshold, 0)
    and (
      v_filters ->> 'source_id' is null
      or v_filters ->> 'source_id' = sources.id::text
    )
    and (
      v_filters ->> 'source_type' is null
      or v_filters ->> 'source_type' = sources.type
    )
    and (
      v_filters ->> 'document_id' is null
      or v_filters ->> 'document_id' = documents.id::text
    )
    and (
      v_filters ->> 'document_uri' is null
      or v_filters ->> 'document_uri' = documents.uri
    )
    and (
      v_metadata_filters = '{}'::jsonb
      or chunks.metadata @> v_metadata_filters
      or coalesce(documents.metadata, '{}'::jsonb) @> v_metadata_filters
      or coalesce(sources.metadata, '{}'::jsonb) @> v_metadata_filters
    )
  order by chunks.embedding <=> p_query_embedding
  limit v_limit;
end;
$$;

grant execute on function public.ai_match_knowledge(text, extensions.vector, integer, double precision, jsonb)
  to authenticated, service_role;
