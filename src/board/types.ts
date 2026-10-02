// Board row types — mirror of supabase/migrations/0001_board.sql
// (10-project-board.md §5.4). Column names stay snake_case so rows go
// straight between supabase-js and the UI with no mapping layer.

import type { PostRecord } from '../types';

export type MemberId = string;
export type LabelId = string;

export interface TeamMember {
  id: MemberId;
  email: string;
  display_name: string;
  initials: string | null;
  role: 'member' | 'admin';
  active: boolean;
}

export interface Label {
  id: LabelId;
  column_key: 'status' | 'phase';
  name: string;
  color: string; // '#RRGGBB'
  sort_order: number;
  is_default: boolean;
  is_done: boolean;
  is_system: boolean;
  archived: boolean;
}

export interface Project {
  id: string;
  name: string;
  sow_coordinator_id: MemberId | null;
  status_id: LabelId | null;
  phase_id: LabelId | null;
  designed_date: string | null; // 'YYYY-MM-DD' — calendar date, parse with lib/dates
  rating: 1 | 2 | 3 | null;
  position: number;
  archived_at: string | null;
  created_by: MemberId | null;
  created_at: string;
  updated_by: MemberId | null;
  updated_at: string;
}

/** A `posts` row: the existing PostRecord travels untouched inside `payload`. */
export interface PostRow {
  id: string;
  project_id: string | null;
  author_id: MemberId | null; // "Posting as"
  state: 'draft' | 'posted';
  customer: string | null;
  install_date: string | null; // 'YYYY-MM-DD'
  payload: PostRecord;
  posted_at: string | null;
  deleted_at: string | null; // tombstone — see 0001_board.sql header
  updated_at: string;
  updated_by: MemberId | null;
}
