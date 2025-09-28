export async function up(knex) {
  await knex.raw('CREATE TYPE zalo_user_gender AS ENUM (\'male\', \'female\', \'other\', \'unknown\');')
  await knex.raw('CREATE TYPE zalo_group_member_role AS ENUM (\'member\', \'deputy\', \'owner\');')
  await knex.raw('CREATE TYPE zalo_conversation_type AS ENUM (\'user\', \'group\');')
  await knex.raw('CREATE TYPE zalo_attachment_type AS ENUM (\'photo\', \'video\', \'file\', \'gif\', \'sticker\', \'voice\', \'link\', \'card\', \'bank_card\');')

  await knex.schema.createTable('zalo_users', (table) => {
    table.string('id').primary()
    table.string('display_name').notNullable()
    table.string('zalo_name')
    table.text('avatar_url')
    table.text('cover_url')
    table.specificType('gender', 'zalo_user_gender').defaultTo('unknown')
    table.timestamp('date_of_birth', { useTz: true })
    table.text('status_message')
    table.boolean('is_friend').defaultTo(false)
    table.string('alias').nullable()
    table.timestamp('last_online', { useTz: true }).nullable()
    table.timestamps(true, true) // created_at, updated_at
  })

  await knex.schema.createTable('zalo_groups', (table) => {
    table.string('id').primary()
    table.string('name').notNullable()
    table.text('avatar_url')
    table.text('description')
    table.string('owner_id').references('id').inTable('zalo_users').onDelete('SET NULL')
    table.integer('total_members').defaultTo(0)
    table.text('invite_link')
    table.timestamp('created_at_zalo', { useTz: true })
    table.timestamps(true, true)
  })

  await knex.schema.createTable('zalo_group_members', (table) => {
    table.increments('id').primary()
    table.string('group_id').notNullable().references('id').inTable('zalo_groups').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('zalo_users').onDelete('CASCADE')
    table.specificType('role', 'zalo_group_member_role').defaultTo('member')
    table.timestamp('joined_at', { useTz: true }).defaultTo(knex.fn.now())
    table.unique(['group_id', 'user_id'])
  })

  await knex.schema.createTable('zalo_conversations', (table) => {
    table.string('id').primary()
    table.specificType('type', 'zalo_conversation_type').notNullable()
    table.string('last_message_id').nullable() // FK added later
    table.boolean('is_pinned').defaultTo(false)
    table.boolean('is_archived').defaultTo(false)
    table.boolean('is_hidden').defaultTo(false)
    table.boolean('is_muted').defaultTo(false)
    table.integer('unread_count').defaultTo(0)
    table.timestamps(true, true)
  })

  await knex.schema.createTable('zalo_messages', (table) => {
    table.string('id').primary()
    table.string('client_id').notNullable().unique()
    table.string('conversation_id').notNullable().references('id').inTable('zalo_conversations').onDelete('CASCADE')
    table.string('sender_id').references('id').inTable('zalo_users').onDelete('SET NULL')
    table.text('content')
    table.string('type', 50)
    table.timestamp('sent_at', { useTz: true }).notNullable()
    table.boolean('is_undone').defaultTo(false)
    table.string('reply_to_message_id').nullable().references('id').inTable('zalo_messages').onDelete('SET NULL')
    table.jsonb('raw_data') // Store original payload
  })

  await knex.schema.alterTable('zalo_conversations', (table) => {
    table.foreign('last_message_id').references('id').inTable('zalo_messages').onDelete('SET NULL')
  })

  await knex.schema.createTable('zalo_attachments', (table) => {
    table.increments('id').primary()
    table.string('message_id').notNullable().references('id').inTable('zalo_messages').onDelete('CASCADE')
    table.specificType('type', 'zalo_attachment_type').notNullable()
    table.text('url').notNullable()
    table.text('thumbnail_url')
    table.string('file_name')
    table.bigInteger('file_size')
    table.jsonb('metadata')
  })

  await knex.schema.createTable('zalo_reactions', (table) => {
    table.increments('id').primary()
    table.string('message_id').notNullable().references('id').inTable('zalo_messages').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('zalo_users').onDelete('CASCADE')
    table.string('reaction_icon', 50).notNullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.unique(['message_id', 'user_id'])
  })

  await knex.schema.createTable('zalo_labels', (table) => {
    table.string('id').primary()
    table.string('name').notNullable()
    table.string('color_hex', 7)
    table.timestamps(true, true)
  })

  await knex.schema.createTable('zalo_conversation_labels', (table) => {
    table.increments('id').primary()
    table.string('conversation_id').notNullable().references('id').inTable('zalo_conversations').onDelete('CASCADE')
    table.string('label_id').notNullable().references('id').inTable('zalo_labels').onDelete('CASCADE')
    table.unique(['conversation_id', 'label_id'])
  })

  await knex.schema.createTable('zalo_quick_messages', (table) => {
    table.string('id').primary()
    table.string('keyword').notNullable()
    table.text('title').notNullable()
    table.jsonb('media_attachment')
    table.timestamps(true, true)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('zalo_quick_messages')
  await knex.schema.dropTableIfExists('zalo_conversation_labels')
  await knex.schema.dropTableIfExists('zalo_labels')
  await knex.schema.dropTableIfExists('zalo_reactions')
  await knex.schema.dropTableIfExists('zalo_attachments')

  await knex.schema.alterTable('zalo_conversations', (table) => {
    table.dropForeign('last_message_id')
  })
  await knex.schema.dropTableIfExists('zalo_messages')
  await knex.schema.dropTableIfExists('zalo_conversations')
  await knex.schema.dropTableIfExists('zalo_group_members')
  await knex.schema.dropTableIfExists('zalo_groups')
  await knex.schema.dropTableIfExists('zalo_users')

  await knex.raw('DROP TYPE IF EXISTS zalo_user_gender;')
  await knex.raw('DROP TYPE IF EXISTS zalo_group_member_role;')
  await knex.raw('DROP TYPE IF EXISTS zalo_conversation_type;')
  await knex.raw('DROP TYPE IF EXISTS zalo_attachment_type;')
}
