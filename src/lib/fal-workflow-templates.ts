/**
 * Curated fal [Workflow Endpoints](https://fal.ai/docs/documentation/model-apis/workflows.md)
 * (`workflows/...`) runnable via `fal.stream` in the orchestrator.
 */
export type FalWorkflowTemplate = {
  id: string;
  title: string;
  description: string;
  defaultFalInput: Record<string, unknown>;
};

export const FAL_WORKFLOW_TEMPLATES: FalWorkflowTemplate[] = [
  {
    id: "workflows/template/weather",
    title: "Weather",
    description: "Image + weather text → video (template).",
    defaultFalInput: {
      weather: "sunny with light clouds",
      image_urls: [] as string[],
    },
  },
  {
    id: "workflows/fal-ai/sdxl-sticker",
    title: "SDXL sticker",
    description: "Three-step pipeline: generate, remove background, stickerize.",
    defaultFalInput: {
      prompt: "a face of a cute puppy, in the style of pixar animation",
    },
  },
];
