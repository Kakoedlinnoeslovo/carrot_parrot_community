/**
 * Canonical index of fal.ai documentation for LLMs and humans.
 * Use this as the crawl root before exploring specific guides.
 */
export const FAL_DOCS_LLMS_INDEX = "https://fal.ai/docs/llms.txt";

/** High-signal pages for Model APIs and hosted workflows. */
export const FAL_DOCS = {
  modelApisOverview: "https://fal.ai/docs/documentation/model-apis/overview.md",
  inferenceIndex: "https://fal.ai/docs/documentation/model-apis/inference/index.md",
  workflowEndpoints: "https://fal.ai/docs/documentation/model-apis/workflows.md",
  jsClient: "https://fal.ai/docs/api-reference/client-libraries/javascript/index.md",
  jsQueue: "https://fal.ai/docs/api-reference/client-libraries/javascript/queue.md",
  jsStreaming: "https://fal.ai/docs/api-reference/client-libraries/javascript/streaming.md",
  platformModels: "https://fal.ai/docs/api-reference/platform-apis/for-models.md",
  platformWorkflows: "https://fal.ai/docs/api-reference/platform-apis/for-workflows.md",
} as const;
