-- Issue #95 (dangjingtao/uichat-mira-mobile): tasks whose Final Draft was
-- already confirmed used to stay lifecycle_status = 'ready' because
-- saveFinalDraft never advanced the lifecycle. Mobile list rows therefore
-- kept showing 待你确认 while the detail screen already showed the
-- confirmed Final Draft. New saves advance the lifecycle in code
-- (src/api/mob020.ts); this migration only backfills existing rows.
UPDATE capture_tasks
SET lifecycle_status = 'completed',
    updated_at = CURRENT_TIMESTAMP
WHERE lifecycle_status = 'ready'
  AND EXISTS (
    SELECT 1
    FROM drafts
    WHERE drafts.task_id = capture_tasks.id
      AND drafts.kind = 'final'
      AND drafts.confirmed_at IS NOT NULL
  );
