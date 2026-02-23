import { pipeline, env } from '@huggingface/transformers';

// Skip local model checks, fetch from Hugging Face Hub, allow WASM
env.allowLocalModels = false;
env.useBrowserCache = true;

let detectorPipeline = null;

// The system prompt that enforces strict JSON detection & translation 
const SYSTEM_PROMPT = `You are a linguistic AI editor. Analyse the given text and find segments that sound robotic, generic, overly formal, or rely on common AI rhythm patterns.
For each segment you find, you must translate it into the target Native Language.

Output ONLY a JSON array with this exact structure, nothing else:
[
  {
    "text": "<the exact English text span from the source>",
    "reason": "<short reason why it sounds like AI>",
    "translation": "<the natural, conversational translation of this span into the target Native Language>"
  }
]
If the text sounds completely natural, output []. Do not wrap in markdown or explain your reasoning.`;

async function initPipeline() {
    if (!detectorPipeline) {
        // Post message back to UI that loading has started
        postMessage({ status: 'loading', message: 'Loading local AI model (this may take a moment on first run)...' });

        // We use a small instruction-tuned model capable of basic translation
        // We use the requested Cohere Tiny-Aya model (quantized for browser webgpu)
        detectorPipeline = await pipeline('text-generation', 'onnx-community/tiny-aya-global-ONNX', {
            device: 'webgpu', // Will fallback to wasm if webgpu isn't available
            dtype: 'q4'       // 4-bit quantization for speed and memory
        });

        postMessage({ status: 'ready', message: 'Local model ready.' });
    }
    return detectorPipeline;
}

self.addEventListener('message', async (e) => {
    const { type, text, nativeLanguage } = e.data;

    if (type === 'analyze') {
        try {
            const pipe = await initPipeline();
            postMessage({ status: 'analyzing', message: 'Scanning text locally...' });

            const prompt = `Target Native Language: ${nativeLanguage}\n\nText to analyze:\n"""\n${text}\n"""`;

            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ];

            const output = await pipe(messages, {
                max_new_tokens: 512,
                temperature: 0.1,
                do_sample: false,
            });

            const rawResponse = output[0]?.generated_text?.at(-1)?.content || '[]';

            // Clean up backticks if the model ignored our formatting rules
            const cleanedResponse = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

            let annotations = [];
            try {
                annotations = JSON.parse(cleanedResponse);
                if (!Array.isArray(annotations)) annotations = [];
            } catch (err) {
                console.warn('Worker failed to parse JSON from local model:', cleanedResponse);
                annotations = [];
            }

            postMessage({ status: 'complete', annotations });

        } catch (error) {
            postMessage({ status: 'error', error: error.message });
        }
    }
});
