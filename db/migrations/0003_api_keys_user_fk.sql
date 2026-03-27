ALTER TABLE "api_keys" ADD COLUMN "user_id" integer;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
