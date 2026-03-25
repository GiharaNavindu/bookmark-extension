
/**
 * Simple K-Means Clustering implementation
 * @param {Array<Array<number>>} data - Array of vectors (embeddings)
 * @param {number} k - Number of clusters
 * @param {number} maxIterations - Max iterations
 * @returns {Array<{centroid: Array<number>, indices: Array<number>}>}
 */
export function kMeans(data, k, maxIterations = 20) {
  if (data.length === 0) return [];
  if (k > data.length) k = data.length;

  const dim = data[0].length;
  
  // Initialize centroids randomly
  let centroids = [];
  const usedIndices = new Set();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * data.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      centroids.push([...data[idx]]);
    }
  }

  let clusters = Array(k).fill().map(() => []);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assignment step
    clusters = Array(k).fill().map(() => []);
    
    for (let i = 0; i < data.length; i++) {
      const vec = data[i];
      let bestCluster = 0;
      let minDist = Infinity;

      for (let j = 0; j < k; j++) {
        const dist = cosineDistance(vec, centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = j;
        }
      }
      clusters[bestCluster].push(i);
    }

    // Update step
    let changed = false;
    for (let j = 0; j < k; j++) {
      if (clusters[j].length === 0) continue; // Keep old centroid if empty

      const newCentroid = new Array(dim).fill(0);
      for (const idx of clusters[j]) {
        for (let d = 0; d < dim; d++) {
          newCentroid[d] += data[idx][d];
        }
      }
      for (let d = 0; d < dim; d++) {
        newCentroid[d] /= clusters[j].length;
      }

      // Check if centroid changed
      if (euclideanDistance(centroids[j], newCentroid) > 0.0001) {
        centroids[j] = newCentroid;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return clusters.map((indices, i) => ({
    centroid: centroids[i],
    indices: indices
  })).filter(c => c.indices.length > 0);
}

function cosineDistance(a, b) {
  let dot = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  return 1 - (dot / (Math.sqrt(mA) * Math.sqrt(mB)));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
