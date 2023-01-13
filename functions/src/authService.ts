import * as functions from "firebase-functions"
import { getAuth } from "firebase-admin/auth"

import { minInstances } from "."

const auth = getAuth()
const logger = functions.logger

export const onUserCreated = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    secrets: ["SUPER_ADMIN_EMAIL", "ADMIN_EMAILS"],
  })
  .auth.user()
  .onCreate(async (user) => {
    const uid = user.uid
    const email = user.email?.toLowerCase()
    const providerId = user.providerData[0].providerId

    try {
      if (providerId === "password") {
        if (email) {
          const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
          let adminEmails: string[] =
            JSON.parse(process.env.ADMIN_EMAILS! || "") || []

          if (adminEmails.length > 0) {
            adminEmails = adminEmails.map((e: string) => e.toLowerCase())
          }

          if (email === superAdminEmail) {
            // Super admin
            await auth.setCustomUserClaims(uid, { super_admin: true })
          } else if (adminEmails.includes(email)) {
            // Admin
            await auth.setCustomUserClaims(uid, { admin: true })
          } else {
            // Client
            await auth.setCustomUserClaims(uid, { client: true })
          }
        } else {
          // Client
          await auth.setCustomUserClaims(uid, { client: true })
        }
      } else {
        // Client
        await auth.setCustomUserClaims(uid, { client: true })
      }

      logger.log("Custom claims updated")
      return null
    } catch (error) {
      logger.error(error)
      throw error
    }
  })
