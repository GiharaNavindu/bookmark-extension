
const TOPIC_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
  'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
  'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  'bookmark', 'bookmarks', 'page', 'site', 'website', 'home', 'online', 'free', 'new', 'best', 'top', 'guide', 'tutorial', 'how', 'to', 'learn', 'course'
]);

/**
 * Extract keywords from a list of titles to name a cluster
 * @param {Array<string>} titles - List of titles in the cluster
 * @returns {string} - Generated cluster name
 */
export function generateClusterName(titles) {
  const wordCounts = {};
  
  titles.forEach(title => {
    // Normalize and execute regex to find words
    const words = title.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    
    words.forEach(word => {
      if (word.length > 2 && !TOPIC_STOP_WORDS.has(word) && !/^\d+$/.test(word)) { // Filter short words, stopwords, numbers
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    // Bigrams
    for(let i=0; i < words.length - 1; i++) {
        const w1 = words[i];
        const w2 = words[i+1];
        if (w1.length > 2 && !TOPIC_STOP_WORDS.has(w1) && w2.length > 2 && !TOPIC_STOP_WORDS.has(w2)) {
            const bigram = `${w1} ${w2}`;
            wordCounts[bigram] = (wordCounts[bigram] || 0) + 2.5; // Weight bigrams higher
        }
    }
  });

  // Sort by count
  const sortedWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
  
  if (sortedWords.length === 0) return "Miscellaneous";

  const topWord = sortedWords[0][0];
  // Helper to capitalize first letter of each word
  return topWord.replace(/\b\w/g, c => c.toUpperCase());
}
