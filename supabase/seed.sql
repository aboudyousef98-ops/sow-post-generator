-- seed.sql — labels + team roster (10-project-board.md §5.3).
-- EDIT THE EMAILS FIRST, then run once in the Supabase SQL editor after
-- 0001_board.sql (see SETUP.md step 2). Emails must be the Google accounts
-- each person signs in with.

insert into public.labels (column_key, name, color, sort_order, is_default, is_done, is_system) values
  ('status', 'New project',   '#579BFC', 10, true,  false, true),
  ('status', 'Working on it', '#FDAB3D', 20, false, false, true),
  ('status', 'Done',          '#00C875', 90, false, true,  true),
  ('phase',  'Design',        '#A25DDC', 10, false, false, true),
  ('phase',  'Schedule',      '#0086C0', 20, false, false, true);

insert into public.team_members (email, display_name, initials, role) values
  ('REPLACE-aboud@example.com',    'Aboud Yousef',   'AY', 'admin'),
  ('REPLACE-omar@example.com',     'Omar Rajab',     'OR', 'member'),
  ('REPLACE-mohammad@example.com', 'Mohammad Refai', 'MR', 'member');
