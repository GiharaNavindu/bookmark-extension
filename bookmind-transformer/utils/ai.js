
import { generateClusterName } from './cluster-naming.js';
import { kMeans } from './kmeans.js';
import { env, pipeline } from './transformers.js';

// Configure Transformers.js for extension runtime.
// In this setup, models are fetched remotely once and cached by the browser.
// Disabling local path probing avoids noisy "/models/... Failed to fetch" warnings.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Extension service workers are not cross-origin isolated, so ONNX threading can fail
// with "Atomics.wait cannot be called in this context". Force single-thread wasm.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

/**
 * Singleton for the embedding pipeline
 */
let bgPipeline = null;

const EMBEDDING_MODELS = [
  'Xenova/all-MiniLM-L6-v2',
  'Xenova/bge-small-en-v1.5',
];

const EMBEDDING_BATCH_SIZE = 24;
const MAX_TITLE_CHARS = 240;

async function getPipeline() {
  if (!bgPipeline) {
    bgPipeline = await createPipelineWithFallback();
  }
  return bgPipeline;
}

async function createPipelineWithFallback() {
  let lastError = null;

  for (const modelId of EMBEDDING_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await pipeline('feature-extraction', modelId);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === 3) break;
        await delay(500 * attempt);
      }
    }
  }

  throw new Error(
    `Unable to load embedding model from Hugging Face. This is often temporary (503/service unavailable). ` +
    `Please check internet/VPN/firewall and retry in a minute. Last error: ${lastError?.message || 'unknown error'}`
  );
}

function isRetryable(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('service unavailable') || msg.includes('503') || msg.includes('network');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function to organize bookmarks
 * @param {Array<{id: string, title: string, url: string}>} bookmarks 
 */
export async function clusterBookmarks(bookmarks) {
  if (!bookmarks || bookmarks.length === 0) return {};

  const pipe = await getPipeline();
  
  // Extract titles
  const titles = bookmarks.map(b => (b.title || '').slice(0, MAX_TITLE_CHARS));
  
  // Generate embeddings in small batches to avoid oversized ONNX tensors.
  const embeddings = await embedTitlesInBatches(pipe, titles);

  // Determine K (sqrt of N/2 is a heuristic, or just N/10, constrained between 3 and 15)
  // User prompt said "8-15 topics".
  // Let's use robust logic: Math.max(5, Math.min(15, Math.floor(Math.sqrt(bookmarks.length))))
  let k = Math.max(5, Math.min(15, Math.floor(Math.sqrt(bookmarks.length))));
  if (bookmarks.length < 10) k = 2;

  // Cluster
  const clusters = kMeans(embeddings, k);

  // Format result
  const result = {};

  for (const cluster of clusters) {
    // Get bookmarks in this cluster
    const clusterBookmarks = cluster.indices.map(i => bookmarks[i]);
    
    // Generate Name
    const name = generateClusterName(clusterBookmarks.map(b => b.title));
    
    // Create map entry
    // The extension expects { "Topic Name": [bookmark object, ...] } or similar?
    // checking popup.js:
    /*
      const parsed = JSON.parse(response); // { topics: { "Topic Name": ["id1", "id2"] } }
      ...
      const topicsWithData = {};
      for (const [topic, ids] of Object.entries(parsed.topics)) {
         topicsWithData[topic] = bookmarks...
      }
    */
    // So popup expects { "Topic Name": [b1, b2, ...] } logic internally handled usually.
    // The background script should return the structure popup expects.
    // However, since we are doing this in background, we can return the structure directly.
    
    // Check popup.js again for what exact data structure it saves.
    // saveTopics(topicsWithData) -> State.topics = topics
    // State.topics is { topicName: [bookmark, ...] }
    
    // We run this in background, so we can just return { "Topic Name": [id1, id2] } or full objects.
    // Let's return objects to be safe or consistent with "parsed.topics" logic if we were mocking it.
    // But since we are replacing the logic, we can return the final structure:
    // { "Topic Name": [ {id:..}, {id:..} ] }
    
    // Group existing items if name collision
    if (result[name]) {
        result[name].push(...clusterBookmarks);
    } else {
        result[name] = clusterBookmarks;
    }
  }

  return result;
}

async function embedTitlesInBatches(pipe, titles) {
  const allEmbeddings = [];

  for (let i = 0; i < titles.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = titles.slice(i, i + EMBEDDING_BATCH_SIZE);

    try {
      const output = await pipe(batch, {
        pooling: 'mean',
        normalize: true,
        truncation: true,
        max_length: 128,
      });

      allEmbeddings.push(...output.tolist());
    } catch (error) {
      // Retry the same batch with stricter sequence length to reduce tensor size.
      const output = await pipe(batch, {
        pooling: 'mean',
        normalize: true,
        truncation: true,
        max_length: 64,
      });
      allEmbeddings.push(...output.tolist());
    }
  }

  return allEmbeddings;
}
