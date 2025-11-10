import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../../utils'

/**
 * GET /zalo/users
 * Get users with optional filtering
 */
export default defineEventHandler(async (context, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  const { database } = context

  try {
    const { userId, ids, fields, limit } = req.query

    let query = (database as any)('zalo_users')

    if (userId) {
      query = query.where('id', userId)
    }

    if (ids && typeof ids === 'string') {
      const idArray = ids.split(',')
      query = query.whereIn('id', idArray)
    }

    // ✅ FIX: Map frontend field names to database column names
    const fieldMapping: Record<string, string> = {
      displayname: 'display_name',
      zaloname: 'zalo_name',
      avatarurl: 'avatar_url',
      isfriend: 'is_friend',
      dateofbirth: 'date_of_birth',
      phonenumber: 'phone_number',
      // Add snake_case versions for direct access
      display_name: 'display_name',
      zalo_name: 'zalo_name',
      avatar_url: 'avatar_url',
      is_friend: 'is_friend',
      date_of_birth: 'date_of_birth',
      phone_number: 'phone_number',
      id: 'id',
      gender: 'gender',
    }

    if (fields && typeof fields === 'string') {
      const fieldArray = fields.split(',').map(f => f.trim())
      // Map to database column names
      const dbFields = fieldArray.map(f => fieldMapping[f.toLowerCase()] || f)
      query = query.select(dbFields)
    }
    else {
      query = query.select(['id', 'zalo_name', 'display_name', 'avatar_url', 'is_friend'])
    }

    const limitNum = limit ? Number(limit) : 100
    query = query.limit(limitNum)

    const users = await query

    res.json({ data: users })
  }
  catch (error: any) {
    console.error('[Endpoint /users] Error:', error)
    res.status(500).json({ error: 'Failed to fetch users', details: error.message })
  }
})
