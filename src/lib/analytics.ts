/**
 * Vercel Web Analytics custom events.
 *
 * PII: Do not send email, names, or raw prompts. Use ids, slugs, and coarse enums only.
 * Property values must be string | number | boolean (Vercel custom event limits).
 */
import { track as vercelTrack } from "@vercel/analytics";

export const AnalyticsEvent = {
  authLoginSuccess: "auth_login_success",
  authLoginFailure: "auth_login_failure",
  authRegisterSuccess: "auth_register_success",
  authRegisterFailure: "auth_register_failure",
  authSignOutClick: "auth_sign_out_click",

  navCtaClick: "nav_cta_click",

  workflowNewIntent: "workflow_new_intent",

  canvasAddNode: "canvas_add_node",
  canvasConnect: "canvas_connect",
  canvasDeleteNode: "canvas_delete_node",

  workflowSaveSuccess: "workflow_save_success",
  workflowSaveError: "workflow_save_error",

  workflowRunStart: "workflow_run_start",
  workflowRunComplete: "workflow_run_complete",

  workflowPublishSuccess: "workflow_publish_success",
  workflowPublishError: "workflow_publish_error",

  storageUploadSuccess: "storage_upload_success",
  storageUploadError: "storage_upload_error",

  falModelSelected: "fal_model_selected",
  workflowTemplateApplied: "workflow_template_applied",

  communityLikeToggle: "community_like_toggle",
  communityRemixSuccess: "community_remix_success",

  publishedWorkflowView: "published_workflow_view",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export function track(
  name: AnalyticsEventName,
  properties?: Record<string, string | number | boolean | null>,
): void {
  vercelTrack(name, properties ?? undefined);
}
