import * as functions from "firebase-functions"
import * as admin from "firebase-admin"
import { defineString, defineSecret } from "firebase-functions/params"
import axios from "axios"

const env = defineString("NODE_ENV", { default: "development" })
const cloudflarApiToken = defineSecret("CLOUDFLAR_API_TOKEN")
const cloudflarAccountId = defineSecret("CLOUDFLAR_ACCOUNT_ID")
const cloudflarBaseURL = defineString("CLOUDFLAR_BASE_URL")

admin.initializeApp()

const minInstances = env.equals("production").thenElse(1, 0)

export const transcodeVideo = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    secrets: [cloudflarAccountId, cloudflarApiToken],
  })
  .storage.object()
  .onFinalize(async (obj) => {
    try {
      // File path will be in the form of the storage foldler concatenate uuid without dashes, concatenate a dash and the original uploaded file name, for example `videos/ueib123aibid4576-video1.mp4` and this is unique.
      const filePath = obj.name
      functions.logger.log("path -->", filePath)
      const bucket = admin.storage().bucket(obj.bucket)
      const objectType = obj.contentType

      if (!filePath) {
        functions.logger.log("Object not found")
        return null
      }

      if (!objectType?.startsWith("video/")) {
        functions.logger.log("Only transcode videos")
        return null
      }

      const paths = filePath.split("/")
      const fileName = paths[paths.length - 1]

      // Get a download signed url.
      const uploadedFile = bucket.file(filePath)
      const signedURLs = await uploadedFile.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60,
      })

      const downloadURL = signedURLs[0]
      const cloudflarBaseURLValue = cloudflarBaseURL.value()
      const cloudflarAccountIdValue = cloudflarAccountId.value()
      const cloudflarApiTokenValue = cloudflarApiToken.value()

      const result = await axios({
        method: "POST",
        url: `${cloudflarBaseURLValue}/${cloudflarAccountIdValue}/stream/copy`,
        headers: {
          Authorization: `Bearer ${cloudflarApiTokenValue}`,
          "Content-Type": "application/json",
        },
        data: {
          url: downloadURL,
          meta: {
            name: fileName,
            identifier: filePath,
          },
        },
      })

      functions.logger.log("result -->", result.data)

      return null
    } catch (error) {
      functions.logger.error("Error: -->", error)
      throw error
    }
  })

// export const retrieveVideoDetail = functions
//   .runWith({
//     minInstances,
//     maxInstances: 100,
//     secrets: [cloudflarAccountId, cloudflarApiToken],
//   })
//   .https.onRequest(async (req, res) => {
//     try {
//       // Get the uid query.
//       const uid = req.query.uid

//       if (!uid) {
//         res.status(400).json({ error: "Bad Request" })
//       } else {
//         const cloudflarBaseURLValue = cloudflarBaseURL.value()
//         const cloudflarAccountIdValue = cloudflarAccountId.value()
//         const cloudflarApiTokenValue = cloudflarApiToken.value()

//         // Call Cloudflar retrieve video details endpoint.
//         const result = await axios({
//           method: "GET",
//           url: `${cloudflarBaseURLValue}/${cloudflarAccountIdValue}/stream/${uid}`,
//           headers: {
//             Authorization: `Bearer ${cloudflarApiTokenValue}`,
//           },
//         })

//         functions.logger.log("result -->", result.data)

//         res.status(200).json({ data: result.data })
//       }
//     } catch (error) {
//       functions.logger.error("Error -->", error)
//       res.status(500)
//     }
//   })
