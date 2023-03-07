import * as functions from "firebase-functions"
import * as admin from "firebase-admin"

import { minInstances, webhookAuthKey } from "."

const logger = functions.logger

export const playbackService = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    secrets: [webhookAuthKey],
  })
  .https.onRequest(async (req, res) => {
    try {
      const headers = req.headers["authorization"]
      const token = headers?.split(" ")[1] || ""

      if (token !== webhookAuthKey.value()) throw new Error("UnAuthorized")

      const body = req.body as {
        publishId: string
        status: "uploaded" | "transcoded"
      }
      const { publishId, status } = body
      if (publishId) {
        // `contentPath` example --> <uid>/<handle>/publish/<uuid>/<filename>
        // Split the `contentPath` to get a uuid
        // const publishUuid = contentPath.split("/")[3]

        await admin.firestore().collection("playbacks").doc(publishId).set({
          status,
        })
      }

      logger.log("Playback doc created")

      res.end()
    } catch (error) {
      logger.error(error)
      throw error
    }
  })
