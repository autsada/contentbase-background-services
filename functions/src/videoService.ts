import * as functions from "firebase-functions"
import video from "@google-cloud/video-intelligence"
import path from "path"
import axios from "axios"

import {
  minInstances,
  rawBucket,
  cloudflarApiToken,
  cloudflarAccountId,
  cloudflarBaseURL,
} from "."

const logger = functions.logger
// Human-readable likelihoods
const likelihoods = [
  "UNKNOWN",
  "VERY_UNLIKELY",
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "VERY_LIKELY",
]

// A background triggered function to transcode videos.
export const transcodeVideo = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    secrets: [cloudflarAccountId, cloudflarApiToken],
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 300,
    memory: "1GB",
  })
  .storage.object()
  .onFinalize(async (obj) => {
    try {
      // File path will be in the form of the storage foldler concatenate `/` and uuid without dashes, concatenate a dash and the original uploaded file name, for example `videos/ueib123aibid4576-video1.mp4` and this is unique.
      const filePath = obj.name

      if (!filePath) {
        logger.log("Object not found")
        return null
      }

      const contentType = obj.contentType
      if (!contentType?.startsWith("video/")) {
        logger.log("Only transcode videos")
        return null
      }

      const isAdult = await videoSafeSearchDetection(
        `gs://${obj.bucket}/${filePath}`
      )

      if (isAdult) {
        // Delete the video.
        await rawBucket.file(filePath).delete()
      } else {
        const baseName = path.basename(filePath, path.extname(filePath))
        const extName = path.extname(filePath)
        const fileName = path.format({ name: baseName, ext: extName })
        // Get a download signed url.
        const uploadedFile = rawBucket.file(filePath)
        const signedURLs = await uploadedFile.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60, // 1 hour from now
        })
        const downloadURL = signedURLs[0]
        const cloudflarBaseURLValue = cloudflarBaseURL.value()
        const cloudflarAccountIdValue = cloudflarAccountId.value()
        const cloudflarApiTokenValue = cloudflarApiToken.value()
        await axios({
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
              path: filePath,
            },
          },
        })
      }

      logger.log("Processing video finished")
      return null
    } catch (error) {
      logger.error(error)
      throw error
    }
  })

// Detect adult content
async function videoSafeSearchDetection(gcsUri: string) {
  // Creates a client
  const client = new video.VideoIntelligenceServiceClient()

  // Detects unsafe content
  const [operation] = await client.annotateVideo({
    inputUri: gcsUri,
    features: ["EXPLICIT_CONTENT_DETECTION"] as any,
  })
  const [operationResult] = await operation.promise()
  // Gets unsafe content
  const explicitContentResults = operationResult.annotationResults

  let isAdult: boolean = false

  if (!explicitContentResults) return isAdult

  const results = explicitContentResults[0].explicitAnnotation

  if (results?.frames && results.frames.length > 0) {
    results.frames.forEach((frame) => {
      isAdult =
        (!!frame.pornographyLikelihood &&
          likelihoods[frame.pornographyLikelihood as number] === "POSSIBLE") ||
        (!!frame.pornographyLikelihood &&
          likelihoods[frame.pornographyLikelihood as number] === "LIKELY") ||
        (!!frame.pornographyLikelihood &&
          likelihoods[frame.pornographyLikelihood as number] === "VERY_LIKELY")
    })
  }

  return isAdult
}
