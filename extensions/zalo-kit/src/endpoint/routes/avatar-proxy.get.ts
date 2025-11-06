import type { Accountability } from '@directus/types'
import { defineEventHandler } from '../utils'

/**
 * GET /zalo/avatar-proxy
 * Proxy avatar images to avoid CORS
 */
export default defineEventHandler(async (_, { req, res }) => {
  const _req = req as typeof req & { accountability: Accountability | null }

  if (!_req.accountability?.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'User not authenticated',
    })
    return
  }

  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL parameter is required' })
      return
    }

    const allowedDomains = [
      'https://ava-grp-talk.zadn.vn/',
      'https://s120-ava-talk.zadn.vn/',
      'https://avatar-talk.zadn.vn/',
    ]

    if (!allowedDomains.some(domain => url.startsWith(domain))) {
      console.warn(`[Avatar Proxy] Blocked URL: ${url}`)
      res.status(403).json({ error: 'Only allowed Zalo CDN URLs are permitted' })
      return
    }

    const response = await fetch(url, {
      headers: {},
    })

    if (!response.ok) {
      console.error(`[Avatar Proxy] Failed to fetch ${url} - Status: ${response.status}`)
      res.status(response.status).send(`Failed to fetch image from Zalo. Status: ${response.status}`)
      return
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await response.arrayBuffer()

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    // eslint-disable-next-line node/prefer-global/buffer
    res.send(Buffer.from(buffer))
  }
  catch (error: any) {
    console.error('❌ [Endpoint /avatar-proxy] Error:', error)
    res.status(500).json({ error: 'Failed to proxy image', details: error.message })
  }
})
