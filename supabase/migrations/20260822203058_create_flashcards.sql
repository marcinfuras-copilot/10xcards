create table public.flashcards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- content
  question text not null check (char_length(question) between 1 and 500),
  answer text not null check (char_length(answer) between 1 and 2000),

  -- provenance (PRD success metrics: % AI-generated, edit rate)
  source text not null check (source in ('ai', 'manual')),
  was_edited boolean not null default false,

  -- FSRS scheduling state (matches ts-fsrs's Card shape 1:1)
  due timestamptz not null default now(),
  stability real not null default 0,
  difficulty real not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3), -- ts-fsrs State enum: 0=New,1=Learning,2=Review,3=Relearning
  last_review timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_due_idx on public.flashcards (user_id, due);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row
  execute function public.set_updated_at();

alter table public.flashcards enable row level security;

create policy flashcards_select_own on public.flashcards
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy flashcards_insert_own on public.flashcards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy flashcards_update_own on public.flashcards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy flashcards_delete_own on public.flashcards
  for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.flashcards force row level security;
