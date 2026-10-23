import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type {
	ActionType,
	DrillState,
	JsonObject,
	JsonValue,
	Role,
	ScenarioDefinition,
	ScenarioStatus,
} from "#/engine/types";

const createdAt = timestamp("created_at", { withTimezone: true })
	.notNull()
	.defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
	.notNull()
	.defaultNow();

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		email: text("email").notNull(),
		passwordHash: text("password_hash").notNull(),
		role: text("role", { enum: ["commander", "observer"] })
			.$type<Role>()
			.notNull()
			.default("observer"),
		/** Demo accounts are curated data and the only accounts test mode may reset. */
		isDemo: boolean("is_demo").notNull().default(false),
		createdAt,
		updatedAt,
	},
	(table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** SHA-256 of the opaque cookie token. The raw token is never stored. */
		tokenHash: text("token_hash").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt,
	},
	(table) => [
		uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
		index("sessions_user_id_idx").on(table.userId),
	],
);

export const scenarios = pgTable(
	"scenarios",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: uuid("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		seed: integer("seed").notNull(),
		maxTicks: integer("max_ticks").notNull(),
		definition: jsonb("definition").$type<ScenarioDefinition>().notNull(),
		status: text("status", { enum: ["DRAFT", "READY"] })
			.$type<ScenarioStatus>()
			.notNull()
			.default("DRAFT"),
		createdAt,
		updatedAt,
	},
	(table) => [index("scenarios_owner_id_idx").on(table.ownerId)],
);

export const drills = pgTable(
	"drills",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		scenarioId: uuid("scenario_id")
			.notNull()
			.references(() => scenarios.id, { onDelete: "cascade" }),
		state: text("state", {
			enum: [
				"DRAFT",
				"READY",
				"RUNNING",
				"PAUSED",
				"RESOLVED",
				"FAILED",
				"EVALUATED",
			],
		})
			.$type<DrillState>()
			.notNull()
			.default("READY"),
		tick: integer("tick").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		createdAt,
		updatedAt,
	},
	(table) => [index("drills_scenario_id_idx").on(table.scenarioId)],
);

export const drillEvents = pgTable(
	"drill_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		drillId: uuid("drill_id")
			.notNull()
			.references(() => drills.id, { onDelete: "cascade" }),
		tick: integer("tick").notNull(),
		type: text("type").notNull(),
		payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
		createdAt,
	},
	(table) => [
		index("drill_events_drill_id_tick_idx").on(table.drillId, table.tick),
	],
);

export const deliveries = pgTable(
	"deliveries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		drillId: uuid("drill_id")
			.notNull()
			.references(() => drills.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		attempt: integer("attempt").notNull().default(1),
		/** Mirrors the engine delivery status verbatim so the log needs no mapping. */
		status: text("status", {
			enum: [
				"PENDING",
				"RETRY",
				"DELIVERED",
				"DUPLICATE",
				"HELD",
				"OVERFLOW",
				"REJECTED",
				"FAILED",
				"DEAD_LETTER",
			],
		})
			.$type<
				| "PENDING"
				| "RETRY"
				| "DELIVERED"
				| "DUPLICATE"
				| "HELD"
				| "OVERFLOW"
				| "REJECTED"
				| "FAILED"
				| "DEAD_LETTER"
			>()
			.notNull()
			.default("PENDING"),
		createdAt,
	},
	(table) => [
		uniqueIndex("deliveries_drill_seq_unique").on(table.drillId, table.seq),
		uniqueIndex("deliveries_idempotency_unique").on(
			table.drillId,
			table.idempotencyKey,
		),
	],
);

export const actions = pgTable(
	"actions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		drillId: uuid("drill_id")
			.notNull()
			.references(() => drills.id, { onDelete: "cascade" }),
		type: text("type", {
			enum: [
				"restart_worker",
				"scale_up",
				"rotate_token",
				"enable_circuit_breaker",
				"failover_db",
			],
		})
			.$type<ActionType>()
			.notNull(),
		tick: integer("tick").notNull(),
		correct: boolean("correct").notNull(),
		penalty: integer("penalty").notNull().default(0),
		createdAt,
	},
	(table) => [index("actions_drill_id_idx").on(table.drillId)],
);

export const scores = pgTable(
	"scores",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		drillId: uuid("drill_id")
			.notNull()
			.references(() => drills.id, { onDelete: "cascade" }),
		breakdown: jsonb("breakdown").$type<Record<string, JsonValue>>().notNull(),
		total: integer("total").notNull(),
		grade: text("grade", { enum: ["A", "B", "C", "D", "F"] })
			.$type<"A" | "B" | "C" | "D" | "F">()
			.notNull(),
		createdAt,
	},
	(table) => [uniqueIndex("scores_drill_id_unique").on(table.drillId)],
);

export const shareLinks = pgTable(
	"share_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		drillId: uuid("drill_id")
			.notNull()
			.references(() => drills.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		createdAt,
	},
	(table) => [uniqueIndex("share_links_token_unique").on(table.token)],
);

export const rateLimitHits = pgTable(
	"rate_limit_hits",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		key: text("key").notNull(),
		createdAt,
	},
	(table) => [
		index("rate_limit_hits_key_created_idx").on(table.key, table.createdAt),
	],
);

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	scenarios: many(scenarios),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
	owner: one(users, { fields: [scenarios.ownerId], references: [users.id] }),
	drills: many(drills),
}));

export const drillsRelations = relations(drills, ({ one, many }) => ({
	scenario: one(scenarios, {
		fields: [drills.scenarioId],
		references: [scenarios.id],
	}),
	events: many(drillEvents),
	deliveries: many(deliveries),
	actions: many(actions),
	score: one(scores),
	shareLinks: many(shareLinks),
}));

export type UserRow = typeof users.$inferSelect;
export type ScenarioRow = typeof scenarios.$inferSelect;
export type DrillRow = typeof drills.$inferSelect;
export type ScoreRow = typeof scores.$inferSelect;
