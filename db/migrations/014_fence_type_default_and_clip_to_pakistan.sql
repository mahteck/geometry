-- 1) Set fence_type = 'custom' for all rows where it is NULL.
UPDATE fences_master
SET fence_type = 'custom'
WHERE fence_type IS NULL OR TRIM(COALESCE(fence_type, '')) = '';
