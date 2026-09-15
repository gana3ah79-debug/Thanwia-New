-- THANWIA-NEW / AI QUESTION ENGINE
-- Original-question generation grounded in Egyptian Thanaweya Amma sources.

create extension if not exists pgcrypto;

create table if not exists public.ai_source_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('ministry_book','ministry_model','ministry_exam','assessment','educational_platform','user_owned','other')),
  subject text not null,
  grade text not null default 'الصف الثالث الثانوي',
  branch text,
  school_year text,
  url text,
  content text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_sources_subject on public.ai_source_documents(subject, grade, branch);
create index if not exists idx_ai_sources_active on public.ai_source_documents(is_active);

create table if not exists public.ai_question_blueprints (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid references public.ai_source_documents(id) on delete set null,
  subject text not null,
  grade text not null default 'الصف الثالث الثانوي',
  branch text,
  unit text,
  lesson text,
  concept text,
  skill text,
  question_type text not null default 'mcq',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard','elite')),
  cognitive_level text,
  reference_note text,
  blueprint text not null,
  fingerprint text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_blueprints_lookup on public.ai_question_blueprints(subject, grade, branch, unit, lesson, difficulty);
create unique index if not exists idx_ai_blueprints_fingerprint on public.ai_question_blueprints(fingerprint) where fingerprint is not null;

create table if not exists public.ai_generated_questions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid references public.ai_question_blueprints(id) on delete set null,
  source_document_id uuid references public.ai_source_documents(id) on delete set null,
  subject text not null,
  grade text not null default 'الصف الثالث الثانوي',
  branch text,
  unit text,
  lesson text,
  concept text,
  skill text,
  question_type text not null default 'mcq',
  difficulty text not null,
  cognitive_level text,
  stem text not null,
  options jsonb not null,
  correct_option integer not null check (correct_option between 0 and 3),
  explanation text not null,
  common_mistake text,
  estimated_seconds integer,
  fingerprint text,
  quality_score numeric(5,2),
  status text not null default 'approved' check (status in ('draft','approved','rejected','retired')),
  model text,
  generation_run_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_questions_filter on public.ai_generated_questions(subject, grade, branch, unit, lesson, difficulty, status);
create index if not exists idx_ai_questions_fingerprint on public.ai_generated_questions(fingerprint);

create table if not exists public.ai_generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  subject text not null,
  grade text not null default 'الصف الثالث الثانوي',
  branch text,
  unit text,
  lesson text,
  difficulty text,
  count_requested integer not null default 10,
  count_generated integer not null default 0,
  model text,
  status text not null default 'started' check (status in ('started','completed','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

-- Official Ministry starting sources. These are references, not copied textbook content.
insert into public.ai_source_documents (title, source_type, subject, grade, school_year, url)
select 'المكتبة الإلكترونية - نماذج الثانوية العامة 2025/2026','ministry_model','عام','الصف الثالث الثانوي','2025/2026','https://studentbooks.moe.gov.eg/sec3guideforms/'
where not exists (select 1 from public.ai_source_documents where url='https://studentbooks.moe.gov.eg/sec3guideforms/');

insert into public.ai_source_documents (title, source_type, subject, grade, school_year, url)
select 'نماذج امتحانات الصف الثالث الثانوي - وزارة التربية والتعليم','ministry_exam','عام','الصف الثالث الثانوي',null,'https://moe.gov.eg/ar/unit_merger/models-exams-sec/'
where not exists (select 1 from public.ai_source_documents where url='https://moe.gov.eg/ar/unit_merger/models-exams-sec/');

insert into public.ai_source_documents (title, source_type, subject, grade, school_year, url)
select 'منصة التعليم الإلكتروني - الصف الثالث الثانوي','ministry_book','عام','الصف الثالث الثانوي',null,'https://moe.gov.eg/ar/elearningenterypage/e-learning/'
where not exists (select 1 from public.ai_source_documents where url='https://moe.gov.eg/ar/elearningenterypage/e-learning/');

alter table public.ai_source_documents enable row level security;
alter table public.ai_question_blueprints enable row level security;
alter table public.ai_generated_questions enable row level security;
alter table public.ai_generation_runs enable row level security;

-- Public read for active source metadata and approved questions; writes stay server-side.
create policy "read active ai sources" on public.ai_source_documents for select using (is_active = true);
create policy "read approved ai questions" on public.ai_generated_questions for select using (status = 'approved');

-- Generation tables are intentionally not writable from the client.
