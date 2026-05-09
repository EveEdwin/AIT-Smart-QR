create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public."qrCodes"') is not null and to_regclass('public.qrcodes') is null then
    execute 'alter table public."qrCodes" rename to qrcodes';
  end if;
end
$$;

create table if not exists public."users" (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."folders" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "userId" uuid not null references auth.users (id) on delete cascade,
  managers text[] not null default '{}'::text[],
  "parentId" uuid null references public."folders" (id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.qrcodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "targetUrl" text,
  type text not null check (type in ('link', 'text', 'file')),
  content jsonb not null default '{}'::jsonb,
  slug text not null unique,
  "folderId" uuid null references public."folders" (id) on delete set null,
  "userId" uuid not null references auth.users (id) on delete cascade,
  managers text[] not null default '{}'::text[],
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "fgColor" text,
  "bgColor" text,
  visibility text not null default 'public' check (visibility in ('public', 'restricted')),
  "allowedEmails" text[] not null default '{}'::text[]
);

create index if not exists "folders_userId_idx" on public."folders" ("userId");
create index if not exists "folders_managers_idx" on public."folders" using gin (managers);
create index if not exists "qrCodes_slug_idx" on public.qrcodes (slug);
create index if not exists "qrCodes_userId_idx" on public.qrcodes ("userId");
create index if not exists "qrCodes_folderId_idx" on public.qrcodes ("folderId");
create index if not exists "qrCodes_managers_idx" on public.qrcodes using gin (managers);
create index if not exists "qrCodes_allowedEmails_idx" on public.qrcodes using gin ("allowedEmails");

drop trigger if exists "users_set_updated_at" on public."users";
create trigger "users_set_updated_at"
before update on public."users"
for each row execute function public.set_updated_at();

drop trigger if exists "folders_set_updated_at" on public."folders";
create trigger "folders_set_updated_at"
before update on public."folders"
for each row execute function public.set_updated_at();

drop trigger if exists "qrCodes_set_updated_at" on public.qrcodes;
create trigger "qrCodes_set_updated_at"
before update on public.qrcodes
for each row execute function public.set_updated_at();

alter table public."users" enable row level security;
alter table public."folders" enable row level security;
alter table public.qrcodes enable row level security;

drop policy if exists "users_select_own" on public."users";
create policy "users_select_own"
on public."users"
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users_insert_own" on public."users";
create policy "users_insert_own"
on public."users"
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users_update_own" on public."users";
create policy "users_update_own"
on public."users"
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "folders_select_own_or_shared" on public."folders";
create policy "folders_select_own_or_shared"
on public."folders"
for select
to authenticated
using (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
);

drop policy if exists "folders_insert_own" on public."folders";
create policy "folders_insert_own"
on public."folders"
for insert
to authenticated
with check ("userId" = auth.uid());

drop policy if exists "folders_update_own_or_shared" on public."folders";
create policy "folders_update_own_or_shared"
on public."folders"
for update
to authenticated
using (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
)
with check (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
);

drop policy if exists "folders_delete_own_or_shared" on public."folders";
create policy "folders_delete_own_or_shared"
on public."folders"
for delete
to authenticated
using (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
);

drop policy if exists "qrCodes_select_public_or_shared" on public.qrcodes;
create policy "qrCodes_select_public_or_shared"
on public.qrcodes
for select
to public
using (
  visibility = 'public'
  or "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
  or coalesce(auth.jwt() ->> 'email', '') = any ("allowedEmails")
);

drop policy if exists "qrCodes_insert_own" on public.qrcodes;
create policy "qrCodes_insert_own"
on public.qrcodes
for insert
to authenticated
with check ("userId" = auth.uid());

drop policy if exists "qrCodes_update_own_or_shared" on public.qrcodes;
create policy "qrCodes_update_own_or_shared"
on public.qrcodes
for update
to authenticated
using (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
)
with check (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
);

drop policy if exists "qrCodes_delete_own_or_shared" on public.qrcodes;
create policy "qrCodes_delete_own_or_shared"
on public.qrcodes
for delete
to authenticated
using (
  "userId" = auth.uid()
  or coalesce(auth.jwt() ->> 'email', '') = any (managers)
);

insert into storage.buckets (id, name, public)
values ('QR-files', 'QR-files', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "QR-files_select_public" on storage.objects;
create policy "QR-files_select_public"
on storage.objects
for select
to public
using (bucket_id = 'QR-files');

drop policy if exists "QR-files_insert_own" on storage.objects;
create policy "QR-files_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'QR-files' and owner = auth.uid());

drop policy if exists "QR-files_update_own" on storage.objects;
create policy "QR-files_update_own"
on storage.objects
for update
to authenticated
using (bucket_id = 'QR-files' and owner = auth.uid())
with check (bucket_id = 'QR-files' and owner = auth.uid());

drop policy if exists "QR-files_delete_own" on storage.objects;
create policy "QR-files_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'QR-files' and owner = auth.uid());