import * as functions from "firebase-functions"
import vision from "@google-cloud/vision"
import rawBody from "raw-body"
import convert from "heic-convert"
import sharp from "sharp"
import path from "path"

import { minInstances, rawBucket, finalBucket } from "."

const logger = functions.logger

// File extension for the created JPEG files.
const JPEG_EXTENSION = ".jpg"

/**
 * Process images uploaded to cloud functions
 * 1. Delete an uploaded image that is flagged as Adult or Violence.
 * 2. Convert to `jpg` and resize an image.
 */
export const processImages = functions
  .runWith({
    minInstances,
    maxInstances: 100,
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 300,
    memory: "1GB",
  })
  .storage.object()
  .onFinalize(async (obj) => {
    try {
      // Get a path of the file.
      const filePath = obj.name

      // Check if the file exists.
      if (!filePath) {
        functions.logger.log("Object not found")
        return null
      }

      // Check if the image content is adult for violence using Vision API.
      const isDetected = await imageSafeSearchDetection(
        `gs://${obj.bucket}/${filePath}`
      )

      if (isDetected) {
        // Delete the image.
        await rawBucket.file(filePath).delete()
      } else {
        // Get file buffer.
        const file = rawBucket.file(filePath)
        const fileBuffer = await rawBody(file.createReadStream())
        let transformedFileBuffer: Buffer | null = null

        // Get file info.
        const fileType = obj.contentType
        const fileSize = obj.size
        const extName = path.extname(filePath)
        const baseName = path.basename(filePath, extName)
        const fileDir = path.dirname(filePath)
        const newFilePath = path.normalize(
          path.format({ dir: fileDir, name: baseName, ext: JPEG_EXTENSION })
        )

        // Convert to `jpg` if it is not already.
        // Use `heic-convert` for `heic` images as `sharp` doesn't support this format.
        if (extName.endsWith("heic")) {
          transformedFileBuffer = (await convert({
            buffer: fileBuffer,
            format: "JPEG",
            quality: 1,
          })) as Buffer
        } else {
          if (!fileType?.startsWith("image/jpeg")) {
            transformedFileBuffer = await sharp(fileBuffer)
              .toFormat("jpg", { mozjpeg: true })
              .toBuffer()
          }
        }

        // Resize depending on the image type.
        // Resizing must come after converting otherwise `heic` will fail as `shart` doesn't support this format.
        // Make sure to use `transformedFileBuffer` if not null.
        // A. If it is a profile image.
        if (fileDir.endsWith("avatars")) {
          transformedFileBuffer = await sharp(
            transformedFileBuffer || fileBuffer
          )
            .resize({ width: 640, height: 640, fit: "contain" })
            .toBuffer()
        } else {
          // B. If it is NOT a profile image, resize if the file size is greater than 500,000 bytes.
          if (Number(fileSize) > 500000) {
            transformedFileBuffer = await sharp(
              transformedFileBuffer || fileBuffer
            )
              .resize({ width: 1920, fit: "inside" })
              .toBuffer()
          }
        }

        // Save the transformed image (if not null) or the original one to the new bucket.
        await finalBucket
          .file(newFilePath)
          .save(transformedFileBuffer || fileBuffer, { resumable: true })
      }

      logger.log("Processing image finished")
      return null
    } catch (error) {
      logger.error(error)
      throw error
    }
  })

// Detect adult or violence content
async function imageSafeSearchDetection(gcsUri: string) {
  // Creates a vision client.
  const visionClient = new vision.ImageAnnotatorClient()

  // Performs safe search property detection on the file.
  const [result] = await visionClient.safeSearchDetection(gcsUri)

  const detections = result.safeSearchAnnotation
  const adultContent =
    detections?.adult === "POSSIBLE" ||
    detections?.adult === "LIKELY" ||
    detections?.adult === "VERY_LIKELY"
  const violenceContent =
    detections?.violence === "POSSIBLE" ||
    detections?.violence === "LIKELY" ||
    detections?.violence === "VERY_LIKELY"

  return adultContent || violenceContent
}
