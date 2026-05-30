//! Heterogeneous graph encoding and sampling.
//!
//! This module ports the xFraud graph-loader and GraphSAGE sampling concepts
//! into deterministic Rust data structures.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet};

use rand::distributions::{Distribution, WeightedIndex};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;

pub(crate) type EdgeTuple = (String, String, i64, i64, String, String, String, i64);

/// Encoded heterogeneous transaction graph.
#[derive(Clone, Debug)]
pub(crate) struct HetGraph {
    pub(crate) node_ids: Vec<String>,
    pub(crate) node_type_codes: Vec<usize>,
    pub(crate) node_ts: Vec<Option<i64>>,
    pub(crate) labels: Vec<Option<i64>>,
    pub(crate) adjacency: Vec<Vec<(usize, usize)>>,
    edge_types: Vec<String>,
    pub(crate) seeds: Vec<usize>,
    pub(crate) node_type_counts: Vec<usize>,
    edge_count: usize,
}

impl HetGraph {
    /// Builds an encoded graph from xFraud edge tuples.
    pub(crate) fn from_edge_tuples(edge_tuples: Vec<EdgeTuple>) -> Result<Self, String> {
        if edge_tuples.is_empty() {
            return Err("edge_tuples must not be empty".to_owned());
        }

        let mut node_index = HashMap::new();
        let mut node_ids = Vec::new();
        let mut node_types = Vec::new();
        let mut node_ts = Vec::new();
        let mut labels = Vec::new();
        let mut adjacency: Vec<Vec<(usize, usize)>> = Vec::new();
        let mut edge_type_index = HashMap::<String, usize>::new();
        let mut edge_types = Vec::new();
        let mut seen_edges = HashSet::<(usize, usize, usize)>::new();
        let mut seeds = HashSet::<usize>::new();
        let mut labeled_srcs = HashSet::<usize>::new();

        for (src, dst, ts, src_label, src_type, dst_type, edge_type, seed) in edge_tuples {
            let src_idx = ensure_node(
                src,
                src_type,
                &mut node_index,
                &mut node_ids,
                &mut node_types,
                &mut node_ts,
                &mut labels,
                &mut adjacency,
            );
            let dst_idx = ensure_node(
                dst,
                dst_type,
                &mut node_index,
                &mut node_ids,
                &mut node_types,
                &mut node_ts,
                &mut labels,
                &mut adjacency,
            );

            node_ts[src_idx].get_or_insert(ts);
            labels[src_idx].get_or_insert(src_label);
            labeled_srcs.insert(src_idx);
            if seed > 0 {
                seeds.insert(src_idx);
            }

            let edge_type_id = ensure_edge_type(edge_type, &mut edge_type_index, &mut edge_types);
            let edge_key = if src_idx <= dst_idx {
                (src_idx, dst_idx, edge_type_id)
            } else {
                (dst_idx, src_idx, edge_type_id)
            };
            if seen_edges.insert(edge_key) {
                adjacency[src_idx].push((dst_idx, edge_type_id));
                if src_idx != dst_idx {
                    adjacency[dst_idx].push((src_idx, edge_type_id));
                }
            }
        }

        let mut seeds: Vec<usize> = if seeds.is_empty() {
            labeled_srcs.into_iter().collect()
        } else {
            seeds.into_iter().collect()
        };
        seeds.sort_by(|left, right| node_ids[*left].cmp(&node_ids[*right]));

        let mut type_names: Vec<String> = node_types
            .iter()
            .cloned()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        type_names.sort();
        let type_encode: HashMap<String, usize> = type_names
            .iter()
            .cloned()
            .enumerate()
            .map(|(idx, value)| (value, idx))
            .collect();
        let node_type_codes: Vec<usize> = node_types
            .iter()
            .map(|node_type| type_encode.get(node_type).copied().unwrap_or(0))
            .collect();
        let mut node_type_counts = vec![0usize; type_names.len().max(1)];
        for code in &node_type_codes {
            node_type_counts[*code] += 1;
        }

        Ok(Self {
            node_ids,
            node_type_codes,
            node_ts,
            labels,
            adjacency,
            edge_types,
            seeds,
            node_type_counts,
            edge_count: seen_edges.len(),
        })
    }

    /// Returns the number of encoded nodes.
    pub(crate) fn node_count(&self) -> usize {
        self.node_ids.len()
    }

    /// Returns the number of undirected graph edges.
    pub(crate) fn edge_count(&self) -> usize {
        self.edge_count
    }

    /// Returns the number of encoded edge types.
    pub(crate) fn edge_type_count(&self) -> usize {
        self.edge_types.len()
    }

    /// Returns the encoded degree for a node.
    pub(crate) fn degree(&self, node_idx: usize) -> usize {
        self.adjacency
            .get(node_idx)
            .map(|neighbors| neighbors.len())
            .unwrap_or(0)
    }

    /// Returns a scale value representing the node type.
    pub(crate) fn node_type_scale(&self, node_idx: usize) -> f64 {
        let max_code = self.node_type_counts.len().saturating_sub(1).max(1);
        self.node_type_codes
            .get(node_idx)
            .map(|code| *code as f64 / max_code as f64)
            .unwrap_or(0.0)
    }

    /// Splits seed nodes using timestamp order.
    pub(crate) fn seed_splits(
        &self,
        train_ratio: f64,
        valid_ratio: f64,
    ) -> (Vec<usize>, Vec<usize>, Vec<usize>) {
        let mut seeds: Vec<usize> = self
            .seeds
            .iter()
            .copied()
            .filter(|idx| self.labels.get(*idx).and_then(|label| *label).is_some())
            .collect();
        seeds.sort_by(|left, right| {
            let left_ts = self.node_ts[*left].unwrap_or(i64::MIN);
            let right_ts = self.node_ts[*right].unwrap_or(i64::MIN);
            left_ts
                .cmp(&right_ts)
                .then_with(|| self.node_ids[*left].cmp(&self.node_ids[*right]))
        });

        let n = seeds.len();
        if n == 0 {
            return (Vec::new(), Vec::new(), Vec::new());
        }
        if n < 3 {
            return (seeds.clone(), Vec::new(), seeds);
        }

        let mut train_end = ((n as f64) * train_ratio).round() as usize;
        train_end = train_end.clamp(1, n - 2);
        let mut valid_end = ((n as f64) * valid_ratio).round() as usize;
        valid_end = valid_end.clamp(train_end + 1, n - 1);

        (
            seeds[..train_end].to_vec(),
            seeds[train_end..valid_end].to_vec(),
            seeds[valid_end..].to_vec(),
        )
    }

    /// Samples GraphSAGE-style context nodes around a seed.
    pub(crate) fn sample_context(
        &self,
        seed: usize,
        depth: usize,
        width: usize,
        sample_method: &str,
        rng: &mut StdRng,
    ) -> Vec<usize> {
        if depth == 0 || width == 0 {
            return Vec::new();
        }

        let mut visited = HashSet::from([seed]);
        let mut frontier = vec![seed];
        let mut out = Vec::new();

        for _ in 0..depth {
            let mut next_frontier = Vec::new();
            for node in frontier {
                for next in self.sample_neighbors(node, width, sample_method, rng) {
                    if visited.insert(next) {
                        out.push(next);
                        next_frontier.push(next);
                    }
                }
            }
            if next_frontier.is_empty() {
                break;
            }
            frontier = next_frontier;
        }

        out
    }

    fn sample_neighbors(
        &self,
        node: usize,
        width: usize,
        sample_method: &str,
        rng: &mut StdRng,
    ) -> Vec<usize> {
        let Some(neighbors) = self.adjacency.get(node) else {
            return Vec::new();
        };
        let mut candidates: Vec<usize> = neighbors.iter().map(|(idx, _)| *idx).collect();
        candidates.sort_unstable();
        candidates.dedup();
        if candidates.len() <= width {
            return candidates;
        }

        if sample_method.starts_with("dw") {
            let weights: Vec<f64> = candidates
                .iter()
                .map(|idx| self.neighbor_weight(*idx, sample_method))
                .collect();
            sample_weighted_without_replacement(&candidates, &weights, width, rng)
        } else {
            candidates.shuffle(rng);
            candidates.truncate(width);
            candidates
        }
    }

    fn neighbor_weight(&self, node: usize, sample_method: &str) -> f64 {
        let degree = self.degree(node).max(1) as f64;
        if sample_method == "dw1-ntw0-sage" {
            return degree;
        }

        let type_count = self
            .node_type_codes
            .get(node)
            .and_then(|code| self.node_type_counts.get(*code))
            .copied()
            .unwrap_or(1)
            .max(1) as f64;
        let node_type_weight = 1.0 / type_count;
        if sample_method == "dw0-ntw1-sage" {
            node_type_weight
        } else {
            node_type_weight * degree
        }
    }
}

fn ensure_node(
    node_id: String,
    node_type: String,
    node_index: &mut HashMap<String, usize>,
    node_ids: &mut Vec<String>,
    node_types: &mut Vec<String>,
    node_ts: &mut Vec<Option<i64>>,
    labels: &mut Vec<Option<i64>>,
    adjacency: &mut Vec<Vec<(usize, usize)>>,
) -> usize {
    if let Some(idx) = node_index.get(&node_id).copied() {
        return idx;
    }

    let idx = node_ids.len();
    node_index.insert(node_id.clone(), idx);
    node_ids.push(node_id);
    node_types.push(node_type);
    node_ts.push(None);
    labels.push(None);
    adjacency.push(Vec::new());
    idx
}

fn ensure_edge_type(
    edge_type: String,
    edge_type_index: &mut HashMap<String, usize>,
    edge_types: &mut Vec<String>,
) -> usize {
    if let Some(idx) = edge_type_index.get(&edge_type).copied() {
        return idx;
    }

    let idx = edge_types.len();
    edge_type_index.insert(edge_type.clone(), idx);
    edge_types.push(edge_type);
    idx
}

fn sample_weighted_without_replacement(
    items: &[usize],
    weights: &[f64],
    width: usize,
    rng: &mut StdRng,
) -> Vec<usize> {
    let mut remaining_items = items.to_vec();
    let mut remaining_weights: Vec<f64> = weights
        .iter()
        .map(|weight| {
            if weight.is_finite() && *weight > 0.0 {
                *weight
            } else {
                0.0
            }
        })
        .collect();
    let mut out = Vec::with_capacity(width);

    for _ in 0..width {
        if remaining_items.is_empty() {
            break;
        }
        let total_weight: f64 = remaining_weights.iter().sum();
        let idx = if total_weight > 0.0 {
            WeightedIndex::new(&remaining_weights)
                .map(|dist| dist.sample(rng))
                .unwrap_or_else(|_| uniform_index(remaining_items.len(), rng))
        } else {
            uniform_index(remaining_items.len(), rng)
        };
        out.push(remaining_items.remove(idx));
        remaining_weights.remove(idx);
    }

    out
}

fn uniform_index(len: usize, rng: &mut StdRng) -> usize {
    let mut idxs: Vec<usize> = (0..len).collect();
    idxs.shuffle(rng);
    idxs[0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    #[test]
    fn graph_builds_seed_splits() {
        let graph = HetGraph::from_edge_tuples(vec![
            edge("tx1", "card1", 1, 0, 1),
            edge("tx2", "card2", 2, 1, 1),
            edge("tx3", "card3", 3, 0, 1),
            edge("tx4", "card4", 4, 1, 1),
        ])
        .expect("graph");

        assert_eq!(graph.node_count(), 8);
        assert_eq!(graph.edge_count(), 4);
        let (train, valid, test) = graph.seed_splits(0.5, 0.75);
        assert_eq!(train.len(), 2);
        assert_eq!(valid.len(), 1);
        assert_eq!(test.len(), 1);
    }

    #[test]
    fn graph_samples_context() {
        let graph = HetGraph::from_edge_tuples(vec![
            edge("tx1", "card1", 1, 0, 1),
            edge("tx1", "device1", 1, 0, 1),
            edge("tx2", "device1", 2, 1, 1),
        ])
        .expect("graph");
        let mut rng = StdRng::seed_from_u64(1);
        let context = graph.sample_context(graph.seeds[0], 2, 2, "sage", &mut rng);
        assert!(!context.is_empty());
    }

    fn edge(src: &str, dst: &str, ts: i64, label: i64, seed: i64) -> EdgeTuple {
        (
            src.to_owned(),
            dst.to_owned(),
            ts,
            label,
            "transaction".to_owned(),
            "entity".to_owned(),
            "uses".to_owned(),
            seed,
        )
    }
}
