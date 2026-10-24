/** Server-side configuration. Never import this from a client component. */
export const config = {
  geminiKey: process.env.GEMINI_API_KEY || "",
  gemmaModel: process.env.GEMMA_MODEL || "gemma-4-31b-it",
  gemmaFallbackModel: process.env.GEMMA_FALLBACK_MODEL || "gemma-4-26b-a4b-it",
  embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-2",
  /** Used for vision screening and batch enrichment. `gemini-flash-latest` tracks the current Flash model. */
  visionModel: process.env.VISION_MODEL || "gemini-flash-latest",
  ttsModel: process.env.TTS_MODEL || "gemini-3.8-flash-tts",
  ttsVoice: process.env.TTS_VOICE || "Kore",
  giphyKey: process.env.GIPHY_API_KEY || "",
  giphyCallsPerHour: Number(process.env.GIPHY_CALLS_PER_HOUR || 100),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  /** Must match vector(N) in supabase/migrations/0001_init.sql. */
  embeddingDims: 768,
  modelTimeoutMs: 15_000,
  ttsTimeoutMs: 20_000,
  storageBucket: "media",
};

export const hasGemini = () => config.geminiKey.length > 0;
export const hasGiphy = () => config.giphyKey.length > 0;
export const hasSupabase = () => config.supabaseUrl.length > 0 && config.supabaseServiceKey.length > 0;
