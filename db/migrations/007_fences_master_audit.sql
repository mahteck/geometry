-- Audit trail for fences_master (who created/edited)

CREATE TABLE IF NOT EXISTS fences_master_audit (
  id SERIAL PRIMARY KEY,
  fence_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT now(),
  changed_by TEXT,
  old_name TEXT,
  new_name TEXT,
  old_status TEXT,
  new_status TEXT,
  old_geom geometry(MultiPolygon, 4326),
  new_geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_fences_master_audit_fence_id ON fences_master_audit (fence_id);
CREATE INDEX IF NOT EXISTS idx_fences_master_audit_changed_at ON fences_master_audit (changed_at);

CREATE OR REPLACE FUNCTION fences_master_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO fences_master_audit (fence_id, action, new_name, new_status, new_geom)
    VALUES (NEW.id, 'insert', NEW.name, NEW.status, NEW.geom);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO fences_master_audit (fence_id, action, old_name, new_name, old_status, new_status, old_geom, new_geom)
    VALUES (NEW.id, 'update', OLD.name, NEW.name, OLD.status, NEW.status, OLD.geom, NEW.geom);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO fences_master_audit (fence_id, action, old_name, old_status, old_geom)
    VALUES (OLD.id, 'delete', OLD.name, OLD.status, OLD.geom);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_fences_master_audit ON fences_master;
CREATE TRIGGER tr_fences_master_audit
  AFTER INSERT OR UPDATE OR DELETE ON fences_master
  FOR EACH ROW EXECUTE PROCEDURE fences_master_audit_trigger();
