-- Friend Challenge V2: multiplayer, turn-based, AI-question-ready
-- This migration is additive. Existing friend_challenges functions remain intact for rollback safety.

create table if not exists public.friend_challenge_players (
  challenge_id uuid not null references public.friend_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot integer not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id),
  unique (challenge_id, slot),
  check (slot >= 0 and slot < 8),
  check (score >= 0)
);

create index if not exists friend_challenge_players_user_idx
  on public.friend_challenge_players(user_id);
create index if not exists friend_challenge_players_challenge_slot_idx
  on public.friend_challenge_players(challenge_id, slot);

alter table public.friend_challenge_players enable row level security;

alter table public.friend_challenges
  add column if not exists rounds integer not null default 5;
alter table public.friend_challenges
  add column if not exists turn_seconds integer not null default 20;
alter table public.friend_challenges
  add column if not exists turn_deadline timestamptz;
alter table public.friend_challenges
  add column if not exists max_players integer not null default 8;

create or replace function public._fc2_participant(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_challenge_players p
    where p.challenge_id = p_challenge_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.fc2_create_challenge(
  p_subject text,
  p_scope_type text,
  p_scope_name text,
  p_question_mode text,
  p_rounds integer default 5,
  p_turn_seconds integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_scope_type not in ('lesson','chapter','full') then raise exception 'INVALID_SCOPE'; end if;
  if p_question_mode not in ('mcq','essay','mixed') then raise exception 'INVALID_MODE'; end if;
  if p_rounds < 1 or p_rounds > 10 then raise exception 'INVALID_ROUNDS'; end if;
  if p_turn_seconds < 10 or p_turn_seconds > 90 then raise exception 'INVALID_TURN_SECONDS'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
    exit when not exists(select 1 from public.friend_challenges where code=v_code);
  end loop;
  insert into public.friend_challenges(
    code, host_id, subject, scope_type, scope_name, question_mode,
    question_count, questions, status, current_index, rounds, turn_seconds, max_players
  ) values (
    v_code, auth.uid(), left(trim(p_subject),100), p_scope_type,
    left(trim(coalesce(p_scope_name,'المنهج بالكامل')),160), p_question_mode,
    0, '[]'::jsonb, 'waiting', 0, p_rounds, p_turn_seconds, 8
  ) returning id into v_id;

  insert into public.friend_challenge_players(challenge_id,user_id,slot)
  values(v_id,auth.uid(),0);

  return jsonb_build_object('id',v_id,'code',v_code,'status','waiting','rounds',p_rounds,'turn_seconds',p_turn_seconds);
end;
$$;

create or replace function public.fc2_join_challenge(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.friend_challenges;
  v_slot integer;
  v_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.friend_challenges where code=upper(trim(p_code)) for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;
  if c.host_id=auth.uid() then
    return jsonb_build_object('id',c.id,'code',c.code,'status',c.status);
  end if;
  if c.status <> 'waiting' then raise exception 'CHALLENGE_ALREADY_STARTED'; end if;
  if exists(select 1 from public.friend_challenge_players where challenge_id=c.id and user_id=auth.uid()) then
    return jsonb_build_object('id',c.id,'code',c.code,'status',c.status);
  end if;
  select coalesce(min(s),0) into v_slot
  from generate_series(1,7) s
  where not exists(select 1 from public.friend_challenge_players p where p.challenge_id=c.id and p.slot=s);
  if v_slot is null or v_slot > 7 then raise exception 'CHALLENGE_FULL'; end if;
  insert into public.friend_challenge_players(challenge_id,user_id,slot)
  values(c.id,auth.uid(),v_slot);
  if c.guest_id is null then
    update public.friend_challenges set guest_id=auth.uid() where id=c.id;
  end if;
  select coalesce(display_name,username,'طالب') into v_name from public.profiles where id=auth.uid();
  return jsonb_build_object('id',c.id,'code',c.code,'status','waiting','slot',v_slot,'name',coalesce(v_name,'طالب'));
end;
$$;

create or replace function public.fc2_start_challenge(
  p_challenge_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.friend_challenges;
  v_players integer;
  v_required integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.friend_challenges where id=p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;
  if c.host_id <> auth.uid() then raise exception 'HOST_ONLY'; end if;
  if c.status <> 'waiting' then raise exception 'CHALLENGE_NOT_WAITING'; end if;
  select count(*) into v_players from public.friend_challenge_players where challenge_id=c.id;
  if v_players < 2 then raise exception 'NEED_TWO_PLAYERS'; end if;
  v_required := c.rounds * v_players;
  if jsonb_typeof(coalesce(p_questions,'[]'::jsonb)) <> 'array' then raise exception 'INVALID_QUESTIONS'; end if;
  if jsonb_array_length(p_questions) < v_required then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
  update public.friend_challenges
    set questions=p_questions,
        question_count=v_required,
        current_index=0,
        status='active',
        started_at=now(),
        turn_deadline=now() + make_interval(secs => c.turn_seconds),
        reveal_at=null
  where id=c.id;
  return jsonb_build_object('ok',true,'status','active','player_count',v_players,'question_count',v_required,'current_index',0);
end;
$$;

create or replace function public.fc2_state(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.friend_challenges;
  v_players jsonb;
  v_answers jsonb;
  v_active uuid;
  v_active_slot integer;
  v_count integer;
  v_next integer;
  v_winner uuid;
  v_question jsonb;
  v_answered boolean;
  v_now timestamptz := now();
begin
  if not public._fc2_participant(p_challenge_id) then raise exception 'NOT_PARTICIPANT'; end if;
  select * into c from public.friend_challenges where id=p_challenge_id for update;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'slot',p.slot,'score',p.score,'name',coalesce(pr.display_name,pr.username,'طالب')
  ) order by p.slot),'[]'::jsonb)
  into v_players
  from public.friend_challenge_players p
  left join public.profiles pr on pr.id=p.user_id
  where p.challenge_id=c.id;
  select count(*) into v_count from public.friend_challenge_players where challenge_id=c.id;

  if c.status='active' then
    v_active_slot := c.current_index % greatest(v_count,1);
    select user_id into v_active from public.friend_challenge_players where challenge_id=c.id and slot=v_active_slot;
    select exists(select 1 from public.friend_challenge_answers where challenge_id=c.id and question_index=c.current_index) into v_answered;
    if c.reveal_at is not null and v_now >= c.reveal_at then
      v_next := c.current_index + 1;
      if v_next >= jsonb_array_length(c.questions) then
        select user_id into v_winner from (
          select user_id, sum(score) total from public.friend_challenge_answers where challenge_id=c.id group by user_id order by total desc limit 1
        ) z;
        update public.friend_challenges set status='finished',finished_at=v_now,winner_id=v_winner,reveal_at=null,turn_deadline=null where id=c.id returning * into c;
      else
        update public.friend_challenges set current_index=v_next,reveal_at=null,turn_deadline=v_now+make_interval(secs=>c.turn_seconds) where id=c.id returning * into c;
      end if;
      v_active_slot := c.current_index % greatest(v_count,1);
      select user_id into v_active from public.friend_challenge_players where challenge_id=c.id and slot=v_active_slot;
      v_answered := false;
    elsif c.turn_deadline is not null and v_now >= c.turn_deadline and not v_answered then
      insert into public.friend_challenge_answers(challenge_id,question_index,user_id,answer_text,is_correct,score)
      values(c.id,c.current_index,v_active,'',false,0)
      on conflict(challenge_id,question_index,user_id) do nothing;
      v_next := c.current_index + 1;
      if v_next >= jsonb_array_length(c.questions) then
        select user_id into v_winner from (select user_id,sum(score) total from public.friend_challenge_answers where challenge_id=c.id group by user_id order by total desc limit 1) z;
        update public.friend_challenges set status='finished',finished_at=v_now,winner_id=v_winner,turn_deadline=null where id=c.id returning * into c;
      else
        update public.friend_challenges set current_index=v_next,turn_deadline=v_now+make_interval(secs=>c.turn_seconds),reveal_at=null where id=c.id returning * into c;
      end if;
      v_active_slot := c.current_index % greatest(v_count,1);
      select user_id into v_active from public.friend_challenge_players where challenge_id=c.id and slot=v_active_slot;
      v_answered := false;
    end if;
  end if;

  if c.status='active' then
    v_question := c.questions->c.current_index;
    if not exists(select 1 from public.friend_challenge_answers where challenge_id=c.id and question_index=c.current_index) then
      v_question := v_question - 'correct' - 'modelAnswer' - 'rubric';
    end if;
  else
    v_question := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('question_index',a.question_index,'user_id',a.user_id,'answer_text',a.answer_text,'is_correct',a.is_correct,'score',a.score,'submitted_at',a.submitted_at) order by a.question_index,a.submitted_at),'[]'::jsonb)
  into v_answers from public.friend_challenge_answers a where a.challenge_id=c.id;

  return jsonb_build_object(
    'challenge', jsonb_build_object(
      'id',c.id,'code',c.code,'subject',c.subject,'scope_type',c.scope_type,'scope_name',c.scope_name,
      'question_mode',c.question_mode,'rounds',c.rounds,'turn_seconds',c.turn_seconds,
      'status',c.status,'current_index',c.current_index,'question_count',c.question_count,
      'started_at',c.started_at,'turn_deadline',c.turn_deadline,'reveal_at',c.reveal_at,'winner_id',c.winner_id,
      'active_player_id',case when c.status='active' then (select user_id from public.friend_challenge_players where challenge_id=c.id and slot=(c.current_index % greatest(v_count,1))) end,
      'question',v_question
    ),
    'players',v_players,
    'answers',v_answers
  );
end;
$$;

create or replace function public.fc2_answer(
  p_challenge_id uuid,
  p_answer_text text,
  p_is_correct boolean,
  p_score integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.friend_challenges;
  v_count integer;
  v_active uuid;
  v_score integer;
  q jsonb;
begin
  if not public._fc2_participant(p_challenge_id) then raise exception 'NOT_PARTICIPANT'; end if;
  select * into c from public.friend_challenges where id=p_challenge_id for update;
  if c.status <> 'active' then raise exception 'CHALLENGE_NOT_ACTIVE'; end if;
  select count(*) into v_count from public.friend_challenge_players where challenge_id=c.id;
  select user_id into v_active from public.friend_challenge_players where challenge_id=c.id and slot=(c.current_index % greatest(v_count,1));
  if v_active <> auth.uid() then raise exception 'NOT_YOUR_TURN'; end if;
  if exists(select 1 from public.friend_challenge_answers where challenge_id=c.id and question_index=c.current_index) then raise exception 'ALREADY_ANSWERED'; end if;
  q:=c.questions->c.current_index;
  if coalesce(q->>'type','mcq')='mcq' then
    v_score:=case when trim(coalesce(p_answer_text,''))=coalesce(q->>'correct','') then 10 else 0 end;
  else
    v_score:=greatest(0,least(coalesce(p_score,0),10));
  end if;
  insert into public.friend_challenge_answers(challenge_id,question_index,user_id,answer_text,is_correct,score)
  values(c.id,c.current_index,auth.uid(),left(coalesce(p_answer_text,''),4000),v_score>0,v_score);
  update public.friend_challenge_players set score=score+v_score where challenge_id=c.id and user_id=auth.uid();
  update public.friend_challenges set reveal_at=now()+interval '4 seconds' where id=c.id;
  return jsonb_build_object('ok',true,'score',v_score,'reveal_at',now()+interval '4 seconds');
end;
$$;

create or replace function public.fc2_cancel(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.friend_challenges where id=p_challenge_id and host_id=auth.uid()) then raise exception 'HOST_ONLY'; end if;
  update public.friend_challenges set status='cancelled',finished_at=now() where id=p_challenge_id and status in ('waiting','active');
  return true;
end;
$$;

grant execute on function public.fc2_create_challenge(text,text,text,text,integer,integer) to authenticated;
grant execute on function public.fc2_join_challenge(text) to authenticated;
grant execute on function public.fc2_start_challenge(uuid,jsonb) to authenticated;
grant execute on function public.fc2_state(uuid) to authenticated;
grant execute on function public.fc2_answer(uuid,text,boolean,integer) to authenticated;
grant execute on function public.fc2_cancel(uuid) to authenticated;
grant execute on function public._fc2_participant(uuid) to authenticated;
