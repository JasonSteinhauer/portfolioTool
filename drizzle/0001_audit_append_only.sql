-- Audit-Log ist nur erweiterbar: UPDATE und DELETE werden auf DB-Ebene abgelehnt.
-- Bewusst als Trigger (nicht nur als App-Regel), damit auch ein Fehler im Code
-- oder ein manipulierter Aufruf keine Spuren verwischen kann.
CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events ist append-only (% nicht erlaubt)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
