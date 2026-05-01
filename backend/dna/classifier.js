// Random-forest classifier — pure JS, deserializes a pre-trained forest from
// JSON. The training script lives outside the request path; the runtime only
// needs `predict()`.

class BehavioralForest {
  constructor(numTrees = 10) {
    this.numTrees = numTrees;
    this.trees = [];
  }

  train(data) {
    for (let i = 0; i < this.numTrees; i++) {
      const sample = this.bootstrap(data);
      const tree = this.buildTree(sample, 0);
      this.trees.push(tree);
    }
  }

  bootstrap(data) {
    return Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
  }

  buildTree(data, depth) {
    const isPure = new Set(data.map((d) => d.label)).size === 1;
    if (isPure || depth > 5 || data.length < 5) {
      const counts = data.reduce((acc, d) => {
        acc[d.label] = (acc[d.label] || 0) + 1;
        return acc;
      }, {});
      return {
        leaf: true,
        label: Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b)),
      };
    }

    const featureIdx = Math.floor(Math.random() * 40);
    const threshold = data[Math.floor(Math.random() * data.length)].vector[featureIdx];

    const left = data.filter((d) => d.vector[featureIdx] <= threshold);
    const right = data.filter((d) => d.vector[featureIdx] > threshold);

    if (left.length === 0 || right.length === 0) {
      const counts = data.reduce((acc, d) => {
        acc[d.label] = (acc[d.label] || 0) + 1;
        return acc;
      }, {});
      return {
        leaf: true,
        label: Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b)),
      };
    }

    return {
      leaf: false,
      featureIdx,
      threshold,
      left: this.buildTree(left, depth + 1),
      right: this.buildTree(right, depth + 1),
    };
  }

  predict(vector) {
    if (!this.trees.length) return { prediction: 'unknown', confidence: 0 };
    const votes = this.trees.map((t) => this.traverse(t, vector));
    const counts = votes.reduce((acc, v) => {
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
    const prediction = Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
    const confidence = counts[prediction] / this.trees.length;
    return { prediction, confidence };
  }

  traverse(node, vector) {
    if (node.leaf) return node.label;
    return vector[node.featureIdx] <= node.threshold
      ? this.traverse(node.left, vector)
      : this.traverse(node.right, vector);
  }

  toJSON() {
    return JSON.stringify(this.trees);
  }

  fromJSON(json) {
    this.trees = JSON.parse(json);
    this.numTrees = this.trees.length;
  }
}

module.exports = { BehavioralForest };
