"use client";

import { useEffect, useMemo, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { uploadFileToFalStorage } from "@/lib/fal-storage-upload-client";

type Props = {
  schema: RJSFSchema | null;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  /** When OpenAPI is missing (common for `workflows/...`), show JSON instead of a dead-end message. */
  noSchemaFallback?: "message" | "json";
};

/** Resolve JSON Schema `type` for a property (handles anyOf/oneOf). */
function jsonSchemaPropertyType(prop: unknown): string | undefined {
  if (prop == null || typeof prop !== "object") return undefined;
  const p = prop as Record<string, unknown>;
  if (typeof p.type === "string") return p.type;
  if (Array.isArray(p.type)) {
    if (p.type.includes("string")) return "string";
    return typeof p.type[0] === "string" ? p.type[0] : undefined;
  }
  const variants = [...(Array.isArray(p.anyOf) ? p.anyOf : []), ...(Array.isArray(p.oneOf) ? p.oneOf : [])];
  for (const v of variants) {
    const t = jsonSchemaPropertyType(v);
    if (t) return t;
  }
  return undefined;
}

/** Types that must not use the string `textarea` widget in RJSF. */
const NON_STRING_JSON_TYPES = new Set(["number", "integer", "boolean", "object", "array"]);

/**
 * True if this schema node (or any anyOf/oneOf branch) allows a non-string JSON value.
 * Catches `type: ["string","number"]`, `anyOf: [string, number]`, etc., where a naive
 * "first type wins" heuristic would still assign textarea and crash RJSF.
 */
function schemaAllowsNonStringValue(node: unknown): boolean {
  if (node == null || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (typeof n.type === "string") {
    return NON_STRING_JSON_TYPES.has(n.type);
  }
  if (Array.isArray(n.type)) {
    return n.type.some((t) => typeof t === "string" && NON_STRING_JSON_TYPES.has(t));
  }
  const branches = [...(Array.isArray(n.anyOf) ? n.anyOf : []), ...(Array.isArray(n.oneOf) ? n.oneOf : [])];
  for (const b of branches) {
    if (schemaAllowsNonStringValue(b)) return true;
  }
  return false;
}

const LONG_TEXT_KEYS = /^(prompt|negative_prompt|text|caption|description|input)$/i;

const TEXTAREA_UI = {
  "ui:widget": "textarea",
  "ui:options": { rows: 4 },
} as const;

/** True if this anyOf/oneOf branch should use the large text widget (string-only). */
function branchWantsTextarea(branch: unknown): boolean {
  if (schemaAllowsNonStringValue(branch)) return false;
  return jsonSchemaPropertyType(branch) === "string";
}

/**
 * Build uiSchema for long text fields.
 *
 * Important: for `anyOf` / `oneOf` fields, never set `ui:widget` on the field root — RJSF's
 * `AnyOfField` uses that slot for the numeric branch selector (`getWidget({ type: "number" }, widget, …)`).
 * Putting `textarea` there causes: "No widget 'textarea' for type 'number'".
 * Per-branch widgets go under `ui:<key>.anyOf[i]` / `oneOf[i]` instead.
 */
function buildUiSchemaForModel(schema: RJSFSchema): UiSchema {
  const props = schema.properties;
  if (!props || typeof props !== "object") return {};
  const ui: UiSchema = {};
  for (const key of Object.keys(props as Record<string, unknown>)) {
    if (!LONG_TEXT_KEYS.test(key)) continue;
    const prop = (props as Record<string, unknown>)[key];
    const p = prop as Record<string, unknown>;
    const anyOf = Array.isArray(p.anyOf) ? p.anyOf : null;
    const oneOf = Array.isArray(p.oneOf) ? p.oneOf : null;

    if (anyOf) {
      ui[key] = {
        anyOf: anyOf.map((branch) => (branchWantsTextarea(branch) ? { ...TEXTAREA_UI } : {})),
      } as UiSchema;
      continue;
    }
    if (oneOf) {
      ui[key] = {
        oneOf: oneOf.map((branch) => (branchWantsTextarea(branch) ? { ...TEXTAREA_UI } : {})),
      } as UiSchema;
      continue;
    }

    if (schemaAllowsNonStringValue(prop)) continue;
    const t = jsonSchemaPropertyType(prop);
    if (t === "string") {
      ui[key] = { ...TEXTAREA_UI };
    }
  }
  return ui;
}

function stripImageInputKeys(schema: RJSFSchema): RJSFSchema {
  if (!schema || typeof schema !== "object") return schema;
  const s = schema as Record<string, unknown>;
  const props = s.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return schema;
  const nextProps = { ...props };
  delete nextProps.image_urls;
  delete nextProps.image_url;
  const req = s.required;
  const nextReq = Array.isArray(req)
    ? (req as string[]).filter((r) => r !== "image_urls" && r !== "image_url")
    : req;
  return { ...s, properties: nextProps, required: nextReq } as RJSFSchema;
}

function hasImageUrlsField(schema: RJSFSchema | null): boolean {
  const props = schema?.properties;
  if (!props || typeof props !== "object") return false;
  const p = (props as Record<string, unknown>).image_urls;
  return jsonSchemaPropertyType(p) === "array";
}

function hasImageUrlStringField(schema: RJSFSchema | null): boolean {
  const props = schema?.properties;
  if (!props || typeof props !== "object") return false;
  const p = (props as Record<string, unknown>).image_url;
  return jsonSchemaPropertyType(p) === "string";
}

function ImageUrlRow({
  value,
  onChange,
  onUpload,
}: {
  value: string;
  onChange: (v: string) => void;
  onUpload: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          placeholder="https://…"
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <label className="inline-flex cursor-pointer items-center rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700">
          {busy ? "Uploading…" : "Upload file"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErr(null);
              setBusy(true);
              try {
                const url = await uploadFileToFalStorage(f);
                onUpload(url);
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : String(ex));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

function ImageUrlsEditor({
  formData,
  onPatch,
}: {
  formData: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const raw = formData.image_urls;
  const urls: string[] = Array.isArray(raw) ? raw.map((u) => String(u ?? "")) : [""];
  const list = urls.length ? urls : [""];

  const setAt = (i: number, v: string) => {
    const next = [...list];
    next[i] = v;
    onPatch({ image_urls: next });
  };

  const addRow = () => {
    onPatch({ image_urls: [...list, ""] });
  };

  const removeAt = (i: number) => {
    const next = list.filter((_, j) => j !== i);
    onPatch({ image_urls: next.length ? next : [""] });
  };

  return (
    <div className="space-y-2 rounded border border-zinc-700/80 bg-zinc-900/50 p-2">
      <div className="text-xs font-medium text-zinc-400">Image URLs</div>
      <p className="text-[11px] leading-snug text-zinc-500">
        Required for image-to-image endpoints (e.g. nano-banana-2/edit). Paste a public URL or upload an image —
        we store it on fal and fill the URL.
      </p>
      <div className="space-y-2">
        {list.map((u, i) => (
          <div key={i} className="flex gap-2">
            <div className="min-w-0 flex-1">
              <ImageUrlRow
                value={u}
                onChange={(v) => setAt(i, v)}
                onUpload={(url) => {
                  const next = [...list];
                  next[i] = url;
                  onPatch({ image_urls: next });
                }}
              />
            </div>
            {list.length > 1 ? (
              <button
                type="button"
                className="shrink-0 self-start rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                onClick={() => removeAt(i)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-xs text-orange-400/90 hover:underline"
        onClick={addRow}
      >
        + Add another image URL
      </button>
    </div>
  );
}

function SingleImageUrlEditor({
  formData,
  onPatch,
}: {
  formData: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const value = typeof formData.image_url === "string" ? formData.image_url : "";
  return (
    <div className="space-y-2 rounded border border-zinc-700/80 bg-zinc-900/50 p-2">
      <div className="text-xs font-medium text-zinc-400">Image URL</div>
      <ImageUrlRow
        value={value}
        onChange={(v) => onPatch({ image_url: v })}
        onUpload={(url) => onPatch({ image_url: url })}
      />
    </div>
  );
}

export function FalModelForm({
  schema,
  formData,
  onChange,
  noSchemaFallback = "message",
}: Props) {
  const [rawJson, setRawJson] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(formData, null, 2));

  const merged = useMemo(() => ({ ...formData }), [formData]);

  useEffect(() => {
    setRawText(JSON.stringify(formData, null, 2));
  }, [formData]);

  const rjsfSchema = useMemo(() => {
    if (!schema) return null;
    return stripImageInputKeys(schema);
  }, [schema]);

  const uiSchema = useMemo(() => {
    if (!rjsfSchema) return {};
    return buildUiSchemaForModel(rjsfSchema);
  }, [rjsfSchema]);

  const showImageUrls = hasImageUrlsField(schema);
  const showImageUrl = hasImageUrlStringField(schema);

  const patchForm = (patch: Record<string, unknown>) => {
    onChange({ ...merged, ...patch });
  };

  if (!schema || Object.keys(schema).length === 0) {
    if (noSchemaFallback === "json") {
      return (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            No OpenAPI schema for this endpoint — edit JSON (fal hosted workflows often use this).
          </p>
          <button
            type="button"
            className="text-xs text-orange-400 hover:underline"
            onClick={() => {
              try {
                const parsed = JSON.parse(rawText) as Record<string, unknown>;
                onChange(parsed);
              } catch {
                /* keep editing */
              }
            }}
          >
            Apply JSON
          </button>
          <textarea
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
            rows={14}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>
      );
    }
    return (
      <p className="text-xs text-zinc-500">
        No input schema could be loaded. Use raw JSON below or pick another model.
      </p>
    );
  }

  if (rawJson) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="text-xs text-orange-400 hover:underline"
          onClick={() => {
            try {
              const parsed = JSON.parse(rawText) as Record<string, unknown>;
              onChange(parsed);
              setRawJson(false);
            } catch {
              /* keep editing */
            }
          }}
        >
          Apply JSON
        </button>
        <textarea
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
          rows={12}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <button
          type="button"
          className="text-xs text-zinc-500 hover:text-zinc-300"
          onClick={() => setRawJson(false)}
        >
          Back to form
        </button>
      </div>
    );
  }

  const hasRjsfFields =
    rjsfSchema &&
    typeof rjsfSchema === "object" &&
    rjsfSchema.properties &&
    Object.keys(rjsfSchema.properties as object).length > 0;

  return (
    <div className="fal-rjsf text-zinc-300 max-h-[min(520px,50vh)] space-y-2 overflow-y-auto">
      <button
        type="button"
        className="text-left text-xs text-zinc-500 hover:text-zinc-300"
        onClick={() => {
          setRawText(JSON.stringify(merged, null, 2));
          setRawJson(true);
        }}
      >
        Edit raw JSON…
      </button>
      {showImageUrls ? <ImageUrlsEditor formData={merged} onPatch={patchForm} /> : null}
      {showImageUrl ? <SingleImageUrlEditor formData={merged} onPatch={patchForm} /> : null}
      {hasRjsfFields ? (
        <Form
          schema={rjsfSchema!}
          uiSchema={uiSchema as UiSchema}
          formData={merged}
          validator={validator}
          onChange={(e) => {
            if (e.formData && typeof e.formData === "object" && !Array.isArray(e.formData)) {
              const next = e.formData as Record<string, unknown>;
              const keepUrls = showImageUrls ? { image_urls: merged.image_urls } : {};
              const keepUrl = showImageUrl ? { image_url: merged.image_url } : {};
              onChange({ ...next, ...keepUrls, ...keepUrl });
            }
          }}
          liveValidate
        >
          <></>
        </Form>
      ) : showImageUrls || showImageUrl ? null : (
        <p className="text-xs text-zinc-500">No form fields — use raw JSON.</p>
      )}
    </div>
  );
}
