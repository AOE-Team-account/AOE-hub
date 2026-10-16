// Providers a member may bring their own key for. Base URLs are fixed on
// purpose: letting members type an arbitrary URL would let them aim this
// server at internal addresses (SSRF). Model names stay editable because
// providers rename them often — a stale default should never be a dead end.
export type ByoProviderId = "google" | "anthropic" | "openai" | "groq" | "qwen-cn" | "qwen-intl" | "zhipu" | "siliconflow";

export interface ByoProvider {
  id: ByoProviderId;
  label: string;
  kind: "openai-compatible" | "anthropic";
  baseUrl: string;
  defaultModel: string;
  keyHelpUrl: string;
  /** Which sign-up region the "free key" help lists this service under. */
  region: "china" | "world" | "both";
}

export const BYO_PROVIDERS: Record<ByoProviderId, ByoProvider> = {
  google: {
    id: "google",
    label: "Google AI Studio (free key available)",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.5-flash-lite",
    keyHelpUrl: "https://aistudio.google.com/apikey",
    region: "world",
  },
  groq: {
    id: "groq",
    label: "Groq (free plan available)",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    keyHelpUrl: "https://console.groq.com/keys",
    region: "world",
  },
  "qwen-cn": {
    id: "qwen-cn",
    label: "Qwen — Alibaba Cloud, mainland China region",
    kind: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    keyHelpUrl: "https://bailian.console.aliyun.com/",
    region: "china",
  },
  "qwen-intl": {
    id: "qwen-intl",
    label: "Qwen — Alibaba Cloud, international region",
    kind: "openai-compatible",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    keyHelpUrl: "https://modelstudio.console.alibabacloud.com/",
    region: "china",
  },
  zhipu: {
    id: "zhipu",
    label: "Zhipu GLM (bigmodel.cn)",
    kind: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    keyHelpUrl: "https://open.bigmodel.cn/",
    region: "china",
  },
  siliconflow: {
    id: "siliconflow",
    label: "SiliconFlow",
    kind: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    keyHelpUrl: "https://cloud.siliconflow.cn/",
    region: "china",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-4-5",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    region: "both",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    region: "world",
  },
};

export const BYO_PROVIDER_ORDER: ByoProviderId[] = ["google", "groq", "qwen-cn", "qwen-intl", "zhipu", "siliconflow", "anthropic", "openai"];

/** Services listed first for each region (the rest follow). */
export function providersForRegion(region: "china" | "world" | null): ByoProviderId[] {
  if (!region) return BYO_PROVIDER_ORDER;
  const first = BYO_PROVIDER_ORDER.filter((id) => BYO_PROVIDERS[id].region === region);
  return [...first, ...BYO_PROVIDER_ORDER.filter((id) => !first.includes(id))];
}

export const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;
