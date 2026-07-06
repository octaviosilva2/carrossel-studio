// Schema do banco (Drizzle + Postgres/Neon). Espelha exatamente a secao 1 da spec
// da S3. PKs uuid defaultRandom, timestamps timestamptz, integridade no banco
// (NOT NULL, FK com onDelete, unique, indices). O banco e a ultima linha de defesa.

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --- users — quem loga ---------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"), // nullable — nome de exibicao opcional
  // 'admin' | 'client' — enforced no app (Zod); text simples no banco.
  role: text("role").notNull().default("client"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- clients — identidade padrao da marca (dono = user) ----------------------
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    handle: text("handle").notNull(), // sem "@"
    avatarUrl: text("avatar_url").notNull(), // placeholder do seed
    verified: boolean("verified").notNull().default(false),
    // 'light' | 'dark' — enforced no app (Zod); text simples no banco.
    theme: text("theme").notNull().default("light"),
    // null = onboarding ainda nao concluido pelo client.
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("clients_owner_id_idx").on(table.ownerId)],
);

// --- carousels — o carrossel (dono = user, marca = client, override opcional) -
// Overrides nullable: null = herda do client (nao materializa herdados).
export const carousels = pgTable(
  "carousels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      // restrict: nao apaga carrossel por tabela junto com client (integridade).
      .references(() => clients.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    overrideName: text("override_name"), // null = herda
    overrideHandle: text("override_handle"), // null = herda
    overrideAvatarUrl: text("override_avatar_url"), // null = herda
    overrideVerified: boolean("override_verified"), // null = herda
    overrideTheme: text("override_theme"), // null = herda ('light'|'dark')
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("carousels_owner_id_idx").on(table.ownerId),
    index("carousels_client_id_idx").on(table.clientId),
  ],
);

// --- slides — conteudo ordenado (dono via carousel) --------------------------
// Persistencia da ordem por replace-all: position = indice no editor (0-based).
export const slides = pgTable(
  "slides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carouselId: uuid("carousel_id")
      .notNull()
      .references(() => carousels.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    body: text("body").notNull().default(""),
    imageUrl: text("image_url"), // null = sem imagem; senao URL https do Blob
  },
  (table) => [
    index("slides_carousel_id_idx").on(table.carouselId),
    unique("slides_carousel_position_unq").on(table.carouselId, table.position),
  ],
);

// --- login_attempts — tentativas de login com FALHA (rate limit) -------------
// So falhas sao gravadas. Sucesso NAO gera linha (gera DELETE do email, ver spec).
// Janela deslizante: a consulta filtra por created_at >= now() - 15min.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // email normalizado (trim+lowercase). NULL quando a entrada nao tinha email
    // sintaticamente valido (conta so pro IP — decisao 5).
    email: text("email"),
    // IP de origem (primeiro do x-forwarded-for) ou "unknown" (sentinel). NOT NULL.
    ipAddress: text("ip_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Consulta por e-mail dentro da janela: WHERE email = ? AND created_at >= ?
    index("login_attempts_email_created_at_idx").on(table.email, table.createdAt),
    // Consulta por IP dentro da janela: WHERE ip_address = ? AND created_at >= ?
    index("login_attempts_ip_created_at_idx").on(table.ipAddress, table.createdAt),
  ],
);

// Tipos inferidos para consumo tipado nas actions/mapping (select shapes).
export type UserRow = typeof users.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type CarouselRow = typeof carousels.$inferSelect;
export type SlideRow = typeof slides.$inferSelect;
export type LoginAttemptRow = typeof loginAttempts.$inferSelect;
