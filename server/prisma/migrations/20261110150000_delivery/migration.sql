-- No message bodies, identities, evidence or location data in the delivery queue.
CREATE TABLE push_devices (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint TEXT UNIQUE NOT NULL, subscription JSONB NOT NULL, session_version INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user ON push_devices(user_id);
CREATE TABLE notification_preferences (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false, messages BOOLEAN NOT NULL DEFAULT true, plans BOOLEAN NOT NULL DEFAULT true,
 quiet_start INTEGER CHECK(quiet_start BETWEEN 0 AND 1439), quiet_end INTEGER CHECK(quiet_end BETWEEN 0 AND 1439),
 timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((quiet_start IS NULL)=(quiet_end IS NULL)), CHECK(quiet_start IS NULL OR quiet_start<>quiet_end)
);
CREATE TABLE notification_deliveries (
 id BIGSERIAL PRIMARY KEY, device_id UUID NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('message','invitation','match','meeting','reminder','test')),
 source_id UUID, actor_id UUID, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','suppressed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '1 hour',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, reason TEXT,
 UNIQUE(device_id,event_key)
);
CREATE INDEX notification_due ON notification_deliveries(next_at) WHERE status IN ('pending','sending');
CREATE FUNCTION queue_afterclass_push(recipient UUID,event TEXT,event_kind TEXT,source UUID,actor UUID) RETURNS void LANGUAGE sql AS $$
 INSERT INTO notification_deliveries(device_id,event_key,kind,source_id,actor_id)
 SELECT d.id,event,event_kind,source,actor FROM push_devices d JOIN notification_preferences p ON p.user_id=d.user_id
 WHERE d.user_id=recipient AND p.enabled AND CASE WHEN event_kind='message' THEN p.messages ELSE p.plans END
 ON CONFLICT DO NOTHING;
$$;
CREATE FUNCTION afterclass_push_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient UUID; other UUID; match_id UUID;
BEGIN
 IF TG_TABLE_NAME='messages' THEN
  SELECT CASE WHEN m.user_one_id=NEW.sender_id THEN m.user_two_id ELSE m.user_one_id END,m.id INTO recipient,match_id
  FROM matches m WHERE m.room_id=NEW.room_id AND m.status='active' AND NEW.sender_id IN(m.user_one_id,m.user_two_id);
  IF recipient IS NOT NULL THEN PERFORM queue_afterclass_push(recipient,'message:'||NEW.id,'message',match_id,NEW.sender_id); END IF;
 ELSIF TG_TABLE_NAME='match_applications' THEN
  SELECT requester_id INTO recipient FROM match_requests WHERE id=NEW.request_id;
  PERFORM queue_afterclass_push(recipient,'invitation:'||NEW.id,'invitation',NEW.id,NEW.applicant_id);
 ELSIF TG_TABLE_NAME='matches' THEN
  IF TG_OP='INSERT' THEN
   PERFORM queue_afterclass_push(NEW.user_two_id,'match:'||NEW.id,'match',NEW.id,NEW.user_one_id);
  ELSIF NEW.revision<>OLD.revision THEN
   PERFORM queue_afterclass_push(NEW.user_one_id,'meeting:'||NEW.id||':'||NEW.revision,'meeting',NEW.id,NEW.user_two_id);
   PERFORM queue_afterclass_push(NEW.user_two_id,'meeting:'||NEW.id||':'||NEW.revision,'meeting',NEW.id,NEW.user_one_id);
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER afterclass_message_push AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION afterclass_push_event();
CREATE TRIGGER afterclass_invitation_push AFTER INSERT ON match_applications FOR EACH ROW EXECUTE FUNCTION afterclass_push_event();
CREATE TRIGGER afterclass_match_push AFTER INSERT OR UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION afterclass_push_event();
-- Not exposed through Supabase browser roles.
ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION queue_afterclass_push(UUID,TEXT,TEXT,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION afterclass_push_event() FROM PUBLIC;
