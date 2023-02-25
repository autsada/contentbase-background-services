import * as functions from "firebase-functions"
import { getAuth } from "firebase-admin/auth"

import { minInstances } from "."

const logger = functions.logger

export const onUserCreated = functions
  .runWith({
    minInstances,
    maxInstances: 100,
  })
  .auth.user()
  .onCreate(async (user) => {
    try {
      const uid = user.uid
      const accountType: "TRADITIONAL" | "WALLET" = uid.startsWith("0x")
        ? "WALLET"
        : "TRADITIONAL"
      await getAuth().setCustomUserClaims(uid, { accountType })

      logger.log("User claims updated")
      return null
    } catch (error) {
      logger.error(error)
      throw error
    }
  })
