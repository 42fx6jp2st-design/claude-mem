/**
 * Get session summaries from the database
 */
import type { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import type { SessionSummaryRecord } from '../../../types/database.js';
import type { SessionSummary, GetByIdsOptions } from './types.js';

function normalizeQueryLimit(limit: unknown, max: number = 1000): number | undefined {
  if (limit === undefined || limit === null) {
    return undefined;
  }

  const numeric = typeof limit === 'number' ? limit : Number.parseInt(String(limit), 10);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const normalized = Math.trunc(numeric);
  if (normalized < 1) {
    return undefined;
  }

  return Math.min(normalized, max);
}

/**
 * Get summary for a specific session
 *
 * @param db - Database instance
 * @param memorySessionId - SDK memory session ID
 * @returns Most recent summary for the session, or null if none exists
 */
export function getSummaryForSession(
  db: Database,
  memorySessionId: string
): SessionSummary | null {
  const stmt = db.prepare(`
    SELECT
      request, investigated, learned, completed, next_steps,
      files_read, files_edited, notes, prompt_number, created_at,
      created_at_epoch
    FROM session_summaries
    WHERE memory_session_id = ?
    ORDER BY created_at_epoch DESC
    LIMIT 1
  `);

  return (stmt.get(memorySessionId) as SessionSummary | undefined) || null;
}

/**
 * Get a single session summary by ID
 *
 * @param db - Database instance
 * @param id - Summary ID
 * @returns Full summary record or null if not found
 */
export function getSummaryById(
  db: Database,
  id: number
): SessionSummaryRecord | null {
  const stmt = db.prepare(`
    SELECT * FROM session_summaries WHERE id = ?
  `);

  return (stmt.get(id) as SessionSummaryRecord | undefined) || null;
}

/**
 * Get session summaries by IDs (for hybrid Chroma search)
 * Returns summaries in specified temporal order
 *
 * @param db - Database instance
 * @param ids - Array of summary IDs
 * @param options - Query options (orderBy, limit, project)
 */
export function getSummariesByIds(
  db: Database,
  ids: number[],
  options: GetByIdsOptions = {}
): SessionSummaryRecord[] {
  if (ids.length === 0) return [];

  const { orderBy = 'date_desc', limit, project } = options;
  const orderClause = orderBy === 'date_asc' ? 'ASC' : 'DESC';
  const safeLimit = normalizeQueryLimit(limit);
  const limitClause = safeLimit !== undefined ? 'LIMIT ?' : '';
  const placeholders = ids.map(() => '?').join(',');
  const params: (number | string)[] = [...ids];

  // Apply project filter
  const whereClause = project
    ? `WHERE id IN (${placeholders}) AND project = ?`
    : `WHERE id IN (${placeholders})`;
  if (project) params.push(project);
  if (safeLimit !== undefined) params.push(safeLimit);

  const stmt = db.prepare(`
    SELECT * FROM session_summaries
    ${whereClause}
    ORDER BY created_at_epoch ${orderClause}
    ${limitClause}
  `);

  return stmt.all(...params) as SessionSummaryRecord[];
}
