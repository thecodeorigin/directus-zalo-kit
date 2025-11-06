import type { EndpointExtensionContext } from '@directus/types'
import type { NextFunction, Request, Response } from 'express-serve-static-core'

type EventHandlerCallback = (
  event: EndpointExtensionContext,
  details: {
    req: Request
    res: Response
    next: NextFunction
  },
) => void | Promise<void>

export function defineEventHandler(handler: EventHandlerCallback) {
  return (context: EndpointExtensionContext) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(context, { req, res, next })
      }
      catch (error) {
        return next(error)
      }
    }
  }
}
