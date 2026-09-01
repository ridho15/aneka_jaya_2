export type GeminiOptions = {
  model?: string;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, any>;
  timeoutMs?: number;
};

export async function generateGeminiJson<T = any>(
  prompt: string,
  options: GeminiOptions = {}
): Promise<{ success: boolean; data?: T; rawText?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      error: "GEMINI_API_KEY belum dikonfigurasi di environment (.env / .env.local)."
    };
  }

  const model = options.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody: Record<string, any> = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      responseMimeType: options.responseMimeType ?? "application/json"
    }
  };

  if (options.responseSchema) {
    requestBody.generationConfig.responseSchema = options.responseSchema;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      let parsedError = errorBody;
      try {
        const jsonErr = JSON.parse(errorBody);
        parsedError = jsonErr.error?.message || errorBody;
      } catch {
        // use raw error text
      }

      // If gemini-2.5-flash returns 404 or 400, try fallback to gemini-2.0-flash or gemini-1.5-flash
      if (model === "gemini-2.5-flash" && (response.status === 404 || response.status === 400)) {
        return generateGeminiJson<T>(prompt, { ...options, model: "gemini-2.0-flash" });
      }

      return {
        success: false,
        error: `Gemini API Error (${response.status}): ${parsedError}`
      };
    }

    const resJson = await response.json();
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      return {
        success: false,
        error: "Gemini tidak mengembalikan respons teks."
      };
    }

    try {
      const cleanJsonStr = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsedData = JSON.parse(cleanJsonStr) as T;
      return {
        success: true,
        data: parsedData,
        rawText
      };
    } catch (parseErr) {
      return {
        success: false,
        rawText,
        error: `Gagal mem-parsing JSON dari Gemini: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return {
        success: false,
        error: "Permintaan ke Gemini API melebihi batas waktu (timeout)."
      };
    }
    return {
      success: false,
      error: `Koneksi ke Gemini API gagal: ${err.message || String(err)}`
    };
  }
}
