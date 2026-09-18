-- A credential for something that is not a person, so the agent that maintains
-- a record can reach it.
--
-- A KEY, not a backdoor. A backdoor is a path around authentication: invisible,
-- unrevocable, and indistinguishable from an intrusion. This is listed beside
-- his phones, says when it was last used, ends in one tap, and every request it
-- makes is attributable to it.
CREATE TABLE "agent_keys" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      UUID         NOT NULL,
  "label"        TEXT         NOT NULL,
  -- The secret is never stored. A leaked database must not hand anyone working
  -- access to a health record.
  "token_hash"   TEXT         NOT NULL,
  "scopes"       TEXT[]       NOT NULL DEFAULT ARRAY['files:read','files:write','record:read']::TEXT[],
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "revoked_at"   TIMESTAMP(3),
  "expires_at"   TIMESTAMP(3),
  CONSTRAINT "agent_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_keys_token_hash_key" ON "agent_keys" ("token_hash");
CREATE INDEX "agent_keys_user_id_revoked_at_idx" ON "agent_keys" ("user_id", "revoked_at");

ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
