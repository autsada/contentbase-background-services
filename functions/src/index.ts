import * as admin from "firebase-admin"
import { getStorage } from "firebase-admin/storage"
import { defineString, defineSecret } from "firebase-functions/params"

admin.initializeApp()

const env = defineString("NODE_ENV", { default: "development" })
export const minInstances = env.equals("production").thenElse(1, 0)
export const rawBucket = getStorage().bucket()
export const finalBucket = getStorage().bucket("contentbase-final")
export const cloudflarApiToken = defineSecret("CLOUDFLAR_API_TOKEN")
export const cloudflarAccountId = defineSecret("CLOUDFLAR_ACCOUNT_ID")
export const cloudflarBaseURL = defineString("CLOUDFLAR_BASE_URL")
export const webhookAuthKey = defineSecret("WEBHOOK_AUTH_KEY")

export * from "./imageService"
export * from "./videoService"
export * from "./userService"
export * from "./playbackService"
