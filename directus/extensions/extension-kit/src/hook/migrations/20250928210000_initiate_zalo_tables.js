export async function up(knex) {
  const client = knex.client.config.client;

  try {
    // Create ENUM types only for PostgreSQL - fix syntax
    if (client === "postgresql" || client === "pg") {
      // Check if type exists before creating
      const typeQueries = [
        "DO $$ BEGIN CREATE TYPE zalo_user_gender AS ENUM ('male', 'female', 'other', 'unknown'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
        "DO $$ BEGIN CREATE TYPE zalo_group_member_role AS ENUM ('member', 'deputy', 'owner'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
        "DO $$ BEGIN CREATE TYPE zalo_conversation_type AS ENUM ('user', 'group'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
        "DO $$ BEGIN CREATE TYPE zalo_attachment_type AS ENUM ('photo', 'video', 'file', 'gif', 'sticker', 'voice', 'link', 'card', 'bank_card'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
        "DO $$ BEGIN CREATE TYPE zalo_message_type AS ENUM ('text', 'photo', 'video', 'file', 'sticker', 'voice', 'link', 'location', 'contact'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
      ];

      for (const query of typeQueries) {
        await knex.raw(query);
      }
    }

    // Create zalo_users table
    await knex.schema.createTable("zalo_users", (table) => {
      table.string("id").primary();
      table.string("display_name").notNullable();
      table.string("zalo_name");
      table.text("avatar_url");
      table.text("cover_url");

      // Use ENUM for PostgreSQL, VARCHAR for others
      if (client === "postgresql" || client === "pg") {
        table.specificType("gender", "zalo_user_gender").defaultTo("unknown");
      } else {
        table.string("gender", 10).defaultTo("unknown");
      }

      table.date("date_of_birth");
      table.text("status_message");
      table.boolean("is_friend").defaultTo(false);
      table.string("alias");
      table.timestamp("last_online", { useTz: true });
      table.json("raw_data"); // Use json instead of jsonb for compatibility
      table.timestamps(true, true);
    });

    // Create zalo_groups table
    await knex.schema.createTable("zalo_groups", (table) => {
      table.string("id").primary();
      table.string("name").notNullable();
      table.text("avatar_url");
      table.text("description");
      table.string("owner_id").nullable();
      table.integer("total_members").defaultTo(0);
      table.text("invite_link");
      table.timestamp("created_at_zalo", { useTz: true });
      table.json("settings");
      table.timestamps(true, true);
    });

    // Create zalo_group_members table
    await knex.schema.createTable("zalo_group_members", (table) => {
      table.increments("id").primary();
      table.string("group_id").notNullable();
      table.string("user_id").notNullable();

      if (client === "postgresql" || client === "pg") {
        table
          .specificType("role", "zalo_group_member_role")
          .defaultTo("member");
      } else {
        table.string("role", 10).defaultTo("member");
      }

      table.timestamp("joined_at", { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp("left_at", { useTz: true });
      table.boolean("is_active").defaultTo(true);
      table.unique(["group_id", "user_id"]);
    });

    // Create zalo_conversations table
    await knex.schema.createTable("zalo_conversations", (table) => {
      table.string("id").primary();

      if (client === "postgresql" || client === "pg") {
        table.specificType("type", "zalo_conversation_type").notNullable();
      } else {
        table.string("type", 10).notNullable();
      }

      table.string("participant_id").nullable();
      table.string("group_id").nullable();
      table.string("last_message_id").nullable();
      table.timestamp("last_message_time", { useTz: true });
      table.boolean("is_pinned").defaultTo(false);
      table.boolean("is_archived").defaultTo(false);
      table.boolean("is_hidden").defaultTo(false);
      table.boolean("is_muted").defaultTo(false);
      table.integer("unread_count").defaultTo(0);
      table.timestamp("last_read_message_time", { useTz: true });
      table.json("settings");
      table.timestamps(true, true);
    });

    // Create zalo_messages table
    await knex.schema.createTable("zalo_messages", (table) => {
      table.string("id").primary();
      table.string("client_id").notNullable().unique();
      table.string("conversation_id").notNullable();
      table.string("sender_id").nullable();
      table.text("content");

      if (client === "postgresql" || client === "pg") {
        table.specificType("type", "zalo_message_type").defaultTo("text");
      } else {
        table.string("type", 20).defaultTo("text");
      }

      table.timestamp("sent_at", { useTz: true }).notNullable();
      table.timestamp("received_at", { useTz: true }).defaultTo(knex.fn.now());
      table.boolean("is_undone").defaultTo(false);
      table.boolean("is_edited").defaultTo(false);
      table.timestamp("edited_at", { useTz: true });
      table.string("reply_to_message_id").nullable();
      table.string("forward_from_message_id").nullable();
      table.json("mentions");
      table.json("raw_data");
      table.timestamps(true, true);
    });

    // Create remaining tables
    const tables = [
      {
        name: "zalo_attachments",
        create: (table) => {
          table.increments("id").primary();
          table.string("message_id").notNullable();
          if (client === "postgresql" || client === "pg") {
            table.specificType("type", "zalo_attachment_type").notNullable();
          } else {
            table.string("type", 20).notNullable();
          }
          table.text("url").notNullable();
          table.text("thumbnail_url");
          table.string("file_name");
          table.bigInteger("file_size");
          table.string("mime_type");
          table.integer("width");
          table.integer("height");
          table.integer("duration");
          table.json("metadata");
          table.timestamps(true, true);
        },
      },
      {
        name: "zalo_reactions",
        create: (table) => {
          table.increments("id").primary();
          table.string("message_id").notNullable();
          table.string("user_id").notNullable();
          table.string("reaction_icon", 50).notNullable();
          table
            .timestamp("created_at", { useTz: true })
            .defaultTo(knex.fn.now());
          table.unique(["message_id", "user_id"]);
        },
      },
      {
        name: "zalo_labels",
        create: (table) => {
          table.string("id").primary();
          table.string("name").notNullable();
          table.string("color_hex", 7).defaultTo("#007bff");
          table.text("description");
          table.boolean("is_system").defaultTo(false);
          table.timestamps(true, true);
        },
      },
      {
        name: "zalo_conversation_labels",
        create: (table) => {
          table.increments("id").primary();
          table.string("conversation_id").notNullable();
          table.string("label_id").notNullable();
          table
            .timestamp("applied_at", { useTz: true })
            .defaultTo(knex.fn.now());
          table.unique(["conversation_id", "label_id"]);
        },
      },
      {
        name: "zalo_quick_messages",
        create: (table) => {
          table.string("id").primary();
          table.string("keyword").notNullable().unique();
          table.text("title").notNullable();
          table.text("content");
          table.json("media_attachment");
          table.boolean("is_active").defaultTo(true);
          table.integer("usage_count").defaultTo(0);
          table.timestamp("last_used_at", { useTz: true });
          table.timestamps(true, true);
        },
      },
      {
        name: "zalo_sync_status",
        create: (table) => {
          table.increments("id").primary();
          table.string("conversation_id").notNullable();
          table.timestamp("last_sync_at", { useTz: true });
          table.string("last_message_id_synced");
          table.boolean("is_syncing").defaultTo(false);
          table.json("sync_errors");
          table.timestamps(true, true);
        },
      },
    ];

    // Create remaining tables
    for (const tableConfig of tables) {
      if (!(await knex.schema.hasTable(tableConfig.name))) {
        await knex.schema.createTable(tableConfig.name, tableConfig.create);
      }
    }

    console.log("All Zalo tables created successfully!");
  } catch (error) {
    console.error("Error creating Zalo tables:", error);
    throw error;
  }
}

export async function down(knex) {
  const tables = [
    "zalo_sync_status",
    "zalo_quick_messages",
    "zalo_conversation_labels",
    "zalo_labels",
    "zalo_reactions",
    "zalo_attachments",
    "zalo_messages",
    "zalo_conversations",
    "zalo_group_members",
    "zalo_groups",
    "zalo_users",
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  if (
    knex.client.config.client === "postgresql" ||
    knex.client.config.client === "pg"
  ) {
    const enums = [
      "zalo_message_type",
      "zalo_attachment_type",
      "zalo_conversation_type",
      "zalo_group_member_role",
      "zalo_user_gender",
    ];
    for (const enumType of enums) {
      await knex.raw(`DROP TYPE IF EXISTS ${enumType};`);
    }
  }

  console.log("All Zalo tables dropped successfully!");
}
