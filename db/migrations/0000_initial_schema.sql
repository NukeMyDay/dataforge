CREATE TYPE "pipeline_status" AS ENUM('idle', 'running', 'succeeded', 'failed');

CREATE TABLE IF NOT EXISTS "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_de" text,
	"name_en" text,
	"name_nl" text,
	"country" varchar(2) NOT NULL,
	"city" text,
	"website_url" text,
	"accreditation_status" varchar(64),
	"type" varchar(64),
	"logo_url" text,
	"ranking_position" integer,
	"description_de" text,
	"description_en" text,
	"slug" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"title_de" text,
	"title_en" text,
	"title_nl" text,
	"degree_type" varchar(64) NOT NULL,
	"duration_months" integer,
	"language" varchar(16),
	"delivery_mode" varchar(32),
	"tuition_fee_eur" numeric(10, 2),
	"source_url" text,
	"country" varchar(2) NOT NULL,
	"description_de" text,
	"description_en" text,
	"description_nl" text,
	"ects" integer,
	"field_of_study" varchar(128),
	"isced_code" varchar(16),
	"application_deadline_eu" timestamp with time zone,
	"application_deadline_non_eu" timestamp with time zone,
	"start_dates" text,
	"language_requirements" text,
	"tuition_fee_non_eu_eur" numeric(10, 2),
	"numerus_clausus" boolean DEFAULT false,
	"admission_requirements" text,
	"is_active" boolean DEFAULT true,
	"slug" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "regulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(256) NOT NULL,
	"title_de" text,
	"title_en" text,
	"category" varchar(128) NOT NULL,
	"jurisdiction" varchar(128) NOT NULL,
	"body_de" text,
	"body_en" text,
	"source_url" text,
	"effective_date" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regulations_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "regulation_changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"regulation_id" integer NOT NULL,
	"version" integer NOT NULL,
	"diff_summary_de" text,
	"diff_summary_en" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"label" text,
	"owner_id" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);

CREATE TABLE IF NOT EXISTS "pipelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"schedule" varchar(128),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipelines_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_id" integer NOT NULL,
	"status" "pipeline_status" DEFAULT 'idle' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"records_processed" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "programs" ADD CONSTRAINT "programs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regulation_changelog" ADD CONSTRAINT "regulation_changelog_regulation_id_regulations_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "regulations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE cascade ON UPDATE no action;
