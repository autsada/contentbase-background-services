import * as functions from "firebase-functions"
import { getAuth } from "firebase-admin/auth"

import { minInstances } from "."

const auth = getAuth()
const logger = functions.logger

export const onUserCreated = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    secrets: ["SUPER_ADMIN_EMAIL"],
  })
  .auth.user()
  .onCreate(async (user) => {
    const uid = user.uid
    const email = user.email?.toLowerCase()
    try {
      if (email === process.env.SUPER_ADMIN_EMAIL?.toLowerCase()) {
        // Super admin
        await auth.setCustomUserClaims(uid, { super_admin: true })
      } else {
        await auth.setCustomUserClaims(uid, { client: true })
      }

      logger.log("Custom claims updated")
      return null
    } catch (error) {
      logger.error(error)
      throw error
    }
  })
