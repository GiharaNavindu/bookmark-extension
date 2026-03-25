
import { generateClusterName } from './cluster-naming.js';
import { kMeans } from './kmeans.js';
import { env, pipeline } from './transformers.js';

// Configure Transformers.js
// We desire to run locally. We disable local models check to force fetching from remote (cached)
// or local if available.
env.allowLocalModels = false;
env.useBrowserCache = true;

/**
 * Singleton for the embedding pipeline
 */
let bgPipeline = null;

async function getPipeline() {
  if (!bgPipeline) {
    // xenova/all-MiniLM-L6-v2 is the model
    bgPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return bgPipeline;
}

/**
 * Main function to organize bookmarks
 * @param {Array<{id: string, title: string, url: string}>} bookmarks 
 */
export async function clusterBookmarks(bookmarks) {
  if (!bookmarks || bookmarks.length === 0) return {};

  const pipe = await getPipeline();
  
  // Extract titles
  const titles = bookmarks.map(b => b.title);
  
  // Generate embeddings
  // output is a Tensor. .tolist() gives an array of arrays.
  const output = await pipe(titles, { pooling: 'mean', normalize: true });
  const embeddings = output.tolist(); 

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
