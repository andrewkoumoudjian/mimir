//! Heterogeneous graph construction and sampling primitives.
//!
//! These types port the reusable graph loading and sampling behavior from
//! xFraud while keeping the Rust API deterministic and suitable for streaming.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet};

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyDict;
use rand::distributions::{Distribution, WeightedIndex};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::SeedableRng;

type EdgeTuple = (String, String, i64, i64, String, String, String, i64);

fn graph_type_key(src_type: &str, edge_type: &str, dst_type: &str) -> String {
    format!("{src_type}\u{1f}{edge_type}\u{1f}{dst_type}")
}

fn graph_type_display(key: &str) -> String {
    key.replace('\u{1f}', "|")
}

fn sample_uniform<T: Clone>(items: &[T], width: usize, rng: &mut StdRng) -> Vec<T> {
    let mut idxs: Vec<usize> = (0..items.len()).collect();
    idxs.shuffle(rng);
    idxs.truncate(width);
    idxs.into_iter().map(|idx| items[idx].clone()).collect()
}

fn sample_weighted_without_replacement(
    items: &[String],
    weights: &[f64],
    width: usize,
    rng: &mut StdRng,
) -> Vec<String> {
    if width >= items.len() {
        return items.to_vec();
    }

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
        let total_weight: f64 = remaining_weights.iter().sum();
        let idx = if total_weight > 0.0 {
            WeightedIndex::new(&remaining_weights)
                .map(|dist| dist.sample(rng))
                .unwrap_or_else(|_| rng_index(remaining_items.len(), rng))
        } else {
            rng_index(remaining_items.len(), rng)
        };
        out.push(remaining_items.remove(idx));
        remaining_weights.remove(idx);
    }

    out
}

fn rng_index(len: usize, rng: &mut StdRng) -> usize {
    let mut idxs: Vec<usize> = (0..len).collect();
    idxs.shuffle(rng);
    idxs[0]
}

fn update_budget(budget: &mut HashMap<String, (f64, i64)>, node_id: &str, weight: f64, ts: i64) {
    let entry = budget.entry(node_id.to_owned()).or_insert((0.0, 0));
    entry.0 += weight;
    entry.1 = ts;
}

/// Budget-sampled heterogeneous graph data.
///
/// Use `from_edge_tuples` for xFraud-style edge rows and `sample` to expand
/// seed nodes with type-aware budgets.
#[pyclass]
#[derive(Clone, Debug)]
pub struct GraphData {
    type_adj: HashMap<String, HashMap<String, Vec<String>>>,
    node_gtypes: HashMap<String, Vec<String>>,
    node_ts: HashMap<String, i64>,
    node_type: HashMap<String, String>,
    graph_edge_type: HashMap<String, String>,
    node_label: HashMap<String, i64>,
}

#[pymethods]
impl GraphData {
    /// Builds graph data from xFraud edge tuples.
    ///
    /// Each tuple is `(src, dst, ts, src_label, src_type, dst_type,
    /// graph_edge_type, seed)`. The `seed` field is accepted for compatibility
    /// with `NaiveHetGraph` and ignored here.
    ///
    /// # Errors
    /// Returns an error when no edges are supplied.
    #[staticmethod]
    fn from_edge_tuples(edge_tuples: Vec<EdgeTuple>) -> PyResult<Self> {
        if edge_tuples.is_empty() {
            return Err(PyValueError::new_err("edge_tuples must not be empty"));
        }

        let mut node_ts = HashMap::new();
        let mut node_type = HashMap::new();
        let mut node_label = HashMap::new();
        let mut grouped: HashMap<String, Vec<(String, String)>> = HashMap::new();
        let mut graph_edge_type = HashMap::new();

        for (src, dst, ts, src_label, src_type, dst_type, edge_type, _) in edge_tuples {
            node_ts.entry(src.clone()).or_insert(ts);
            node_type.entry(src.clone()).or_insert(src_type.clone());
            node_type.entry(dst.clone()).or_insert(dst_type.clone());
            node_label.entry(src.clone()).or_insert(src_label);

            let gtype = graph_type_key(&src_type, &edge_type, &dst_type);
            graph_edge_type
                .entry(gtype.clone())
                .or_insert(edge_type.clone());
            grouped.entry(gtype).or_default().push((src, dst));
        }

        let mut type_adj: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        let mut node_gtypes_set: HashMap<String, HashSet<String>> = HashMap::new();

        for (gtype, edges) in grouped {
            let mut adj_sets: HashMap<String, HashSet<String>> = HashMap::new();
            for (src, dst) in edges {
                node_gtypes_set
                    .entry(src.clone())
                    .or_default()
                    .insert(gtype.clone());
                node_gtypes_set
                    .entry(dst.clone())
                    .or_default()
                    .insert(gtype.clone());
                adj_sets.entry(src.clone()).or_default().insert(dst.clone());
                adj_sets.entry(dst).or_default().insert(src);
            }
            let adj = adj_sets
                .into_iter()
                .map(|(node, neighbors)| {
                    let mut values: Vec<String> = neighbors.into_iter().collect();
                    values.sort();
                    (node, values)
                })
                .collect();
            type_adj.insert(gtype, adj);
        }

        let node_gtypes = node_gtypes_set
            .into_iter()
            .map(|(node, gtypes)| {
                let mut values: Vec<String> = gtypes.into_iter().collect();
                values.sort();
                (node, values)
            })
            .collect();

        Ok(Self {
            type_adj,
            node_gtypes,
            node_ts,
            node_type,
            graph_edge_type,
            node_label,
        })
    }

    /// Returns the number of nodes tracked by the graph.
    fn node_count(&self) -> usize {
        self.node_type.len()
    }

    /// Returns the number of typed adjacency groups.
    fn graph_type_count(&self) -> usize {
        self.type_adj.len()
    }

    /// Returns known node identifiers.
    fn node_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.node_type.keys().cloned().collect();
        ids.sort();
        ids
    }

    /// Returns a copy of the node type map.
    fn node_types(&self) -> HashMap<String, String> {
        self.node_type.clone()
    }

    /// Returns a copy of node labels keyed by node id.
    fn node_labels(&self) -> HashMap<String, i64> {
        self.node_label.clone()
    }

    /// Returns graph edge types keyed by graph type.
    fn graph_edge_types(&self) -> HashMap<String, String> {
        self.graph_edge_type
            .iter()
            .map(|(key, value)| (graph_type_display(key), value.clone()))
            .collect()
    }

    /// Samples a timestamp-constrained heterogeneous neighborhood.
    ///
    /// # Errors
    /// Returns an error when `width` is zero.
    #[pyo3(signature = (seeds, depth, width, ts_max, random_seed=None))]
    fn sample(
        &self,
        py: Python<'_>,
        seeds: Vec<String>,
        depth: usize,
        width: usize,
        ts_max: i64,
        random_seed: Option<u64>,
    ) -> PyResult<PyObject> {
        if width == 0 {
            return Err(PyValueError::new_err("width must be greater than zero"));
        }
        let mut rng = StdRng::seed_from_u64(random_seed.unwrap_or(0x5EED_5EED));
        let mut node_ts: HashMap<String, i64> = HashMap::new();
        let mut budget: HashMap<String, (f64, i64)> = HashMap::new();
        let mut node_src: HashMap<String, (String, String)> = HashMap::new();

        for seed in seeds {
            let ts = self.node_ts.get(&seed).copied().unwrap_or(-1);
            node_ts.insert(seed.clone(), ts);
            self.add_budget(
                &seed,
                ts,
                &node_ts,
                &mut budget,
                width,
                ts_max,
                &mut node_src,
                &mut rng,
            );
        }

        for layer in 0..depth {
            let sampled_nodes: Vec<String> = budget.keys().cloned().collect();
            if sampled_nodes.is_empty() {
                break;
            }
            let weights: Vec<f64> = sampled_nodes
                .iter()
                .map(|node| {
                    budget
                        .get(node)
                        .map(|(weight, _)| weight * weight)
                        .unwrap_or(0.0)
                })
                .collect();
            let selected =
                sample_weighted_without_replacement(&sampled_nodes, &weights, width, &mut rng);
            let current_budget = budget.clone();
            budget.clear();

            for node in &selected {
                if let Some((_, ts)) = current_budget.get(node) {
                    node_ts.insert(node.clone(), *ts);
                }
            }

            if layer + 1 < depth {
                for node in selected {
                    if let Some((_, ts)) = current_budget.get(&node) {
                        self.add_budget(
                            &node,
                            *ts,
                            &node_ts,
                            &mut budget,
                            width,
                            ts_max,
                            &mut node_src,
                            &mut rng,
                        );
                    }
                }
            }
        }

        let sampled_node_ids: HashSet<String> = node_ts.keys().cloned().collect();
        let out = PyDict::new(py);
        out.set_item("node_timestamps", node_ts)?;
        let mut edges: Vec<(String, String, String)> = node_src
            .into_iter()
            .filter(|(node, _)| sampled_node_ids.contains(node))
            .map(|(node, (src, gtype))| (node, src, graph_type_display(&gtype)))
            .collect();
        edges.sort();
        out.set_item("edges", edges)?;
        Ok(out.into())
    }
}

impl GraphData {
    fn add_budget(
        &self,
        node_id: &str,
        ts: i64,
        node_ts: &HashMap<String, i64>,
        budget: &mut HashMap<String, (f64, i64)>,
        width: usize,
        ts_max: i64,
        node_src: &mut HashMap<String, (String, String)>,
        rng: &mut StdRng,
    ) {
        let Some(gtypes) = self.node_gtypes.get(node_id) else {
            return;
        };

        for gtype in gtypes {
            let Some(adj) = self.type_adj.get(gtype) else {
                continue;
            };
            let Some(next_ids_all) = adj.get(node_id) else {
                continue;
            };
            if next_ids_all.is_empty() {
                continue;
            }

            let next_size = next_ids_all.len();
            let next_ids = if next_size > width {
                sample_uniform(next_ids_all, width, rng)
            } else {
                next_ids_all.clone()
            };

            for next_id in next_ids {
                if node_ts.contains_key(&next_id) {
                    continue;
                }
                let next_ts = self.node_ts.get(&next_id).copied().unwrap_or(ts);
                if next_ts > ts_max {
                    continue;
                }
                update_budget(budget, &next_id, 1.0 / next_size as f64, next_ts);
                node_src.insert(next_id, (node_id.to_owned(), gtype.clone()));
            }
        }
    }
}

/// Encoded heterogeneous graph for GraphSAGE-style expansion.
///
/// The graph keeps stable node and edge encodings for Python model code.
#[pyclass]
#[derive(Clone, Debug)]
pub struct NaiveHetGraph {
    node_type: HashMap<String, String>,
    node_ts: HashMap<String, i64>,
    seed_label: HashMap<String, i64>,
    node_order: Vec<String>,
    node_encode: HashMap<String, usize>,
    node_type_encode: HashMap<String, usize>,
    edge_type_encode: HashMap<String, usize>,
    edge_list: Vec<(usize, usize, usize)>,
}

#[pymethods]
impl NaiveHetGraph {
    /// Builds an encoded heterogeneous graph from xFraud edge tuples.
    ///
    /// Each tuple is `(src, dst, ts, src_label, src_type, dst_type,
    /// graph_edge_type, seed)`. Reverse edges are included by default to match
    /// xFraud's `create_naive_het_graph_from_edges`.
    ///
    /// # Errors
    /// Returns an error when no edges are supplied.
    #[staticmethod]
    #[pyo3(signature = (edge_tuples, include_reverse=true))]
    fn from_edge_tuples(edge_tuples: Vec<EdgeTuple>, include_reverse: bool) -> PyResult<Self> {
        if edge_tuples.is_empty() {
            return Err(PyValueError::new_err("edge_tuples must not be empty"));
        }

        let mut node_type = HashMap::new();
        let mut node_ts = HashMap::new();
        let mut seed_label = HashMap::new();
        let mut node_order = Vec::new();
        let mut seen_nodes = HashSet::new();
        let mut unique_edges = Vec::<(String, String, String)>::new();
        let mut seen_edges = HashSet::<(String, String, String)>::new();
        let mut edge_types = HashSet::<String>::new();

        for (src, dst, ts, src_label, src_type, dst_type, edge_type, seed) in edge_tuples {
            if seen_nodes.insert(src.clone()) {
                node_order.push(src.clone());
            }
            if seen_nodes.insert(dst.clone()) {
                node_order.push(dst.clone());
            }
            node_ts.entry(src.clone()).or_insert(ts);
            node_type.entry(src.clone()).or_insert(src_type);
            node_type.entry(dst.clone()).or_insert(dst_type);
            edge_types.insert(edge_type.clone());

            let edge = (src.clone(), dst.clone(), edge_type.clone());
            if seen_edges.insert(edge.clone()) {
                unique_edges.push(edge);
            }
            if seed > 0 {
                seed_label.entry(src).or_insert(src_label);
            }
        }

        let node_encode: HashMap<String, usize> = node_order
            .iter()
            .enumerate()
            .map(|(idx, node)| (node.clone(), idx))
            .collect();

        let mut node_types_sorted: Vec<String> = node_type.values().cloned().collect();
        node_types_sorted.sort();
        node_types_sorted.dedup();
        let node_type_encode = node_types_sorted
            .into_iter()
            .enumerate()
            .map(|(idx, node_type)| (node_type, idx))
            .collect();

        let mut edge_types_sorted: Vec<String> = edge_types.into_iter().collect();
        edge_types_sorted.sort();
        let mut edge_type_encode = HashMap::from([("_self".to_owned(), 0usize)]);
        for (idx, edge_type) in edge_types_sorted.into_iter().enumerate() {
            edge_type_encode.insert(edge_type, idx + 1);
        }

        let mut all_edges = unique_edges.clone();
        if include_reverse {
            all_edges.extend(
                unique_edges
                    .into_iter()
                    .map(|(src, dst, edge_type)| (dst, src, edge_type)),
            );
        }

        let edge_list = all_edges
            .into_iter()
            .filter_map(|(src, dst, edge_type)| {
                Some((
                    *node_encode.get(&src)?,
                    *node_encode.get(&dst)?,
                    *edge_type_encode.get(&edge_type)?,
                ))
            })
            .collect();

        Ok(Self {
            node_type,
            node_ts,
            seed_label,
            node_order,
            node_encode,
            node_type_encode,
            edge_type_encode,
            edge_list,
        })
    }

    /// Returns the number of encoded nodes.
    fn node_count(&self) -> usize {
        self.node_order.len()
    }

    /// Returns the number of encoded edges.
    fn edge_count(&self) -> usize {
        self.edge_list.len()
    }

    /// Returns node ids in encoded order.
    fn node_ids(&self) -> Vec<String> {
        self.node_order.clone()
    }

    /// Returns encoded edges as `(src, dst, edge_type)` tuples.
    fn encoded_edges(&self) -> Vec<(usize, usize, usize)> {
        self.edge_list.clone()
    }

    /// Returns the node type encoder.
    fn node_type_encode(&self) -> HashMap<String, usize> {
        self.node_type_encode.clone()
    }

    /// Returns the edge type encoder.
    fn edge_type_encode(&self) -> HashMap<String, usize> {
        self.edge_type_encode.clone()
    }

    /// Returns seed nodes whose timestamp is in `ts_values`.
    fn get_seed_nodes(&self, ts_values: Vec<i64>) -> Vec<String> {
        let ts_set: HashSet<i64> = ts_values.into_iter().collect();
        let mut seeds: Vec<String> = self
            .seed_label
            .keys()
            .filter(|node| {
                self.node_ts
                    .get(*node)
                    .map(|ts| ts_set.contains(ts))
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        seeds.sort();
        seeds
    }

    /// Returns inverse-frequency node-type weights in encoded node order.
    fn node_type_weights(&self) -> Vec<f64> {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for node in &self.node_order {
            if let Some(node_type) = self.node_type.get(node) {
                *counts.entry(node_type.as_str()).or_insert(0) += 1;
            }
        }
        self.node_order
            .iter()
            .map(|node| {
                self.node_type
                    .get(node)
                    .and_then(|node_type| counts.get(node_type.as_str()))
                    .map(|count| 1.0 / *count as f64)
                    .unwrap_or(0.0)
            })
            .collect()
    }

    /// Samples outgoing neighbors from encoded seed nodes.
    ///
    /// # Errors
    /// Returns an error when `width` is zero or a seed is unknown.
    #[pyo3(signature = (seeds, width, depth, random_seed=None))]
    fn sample_neighbors(
        &self,
        py: Python<'_>,
        seeds: Vec<String>,
        width: usize,
        depth: usize,
        random_seed: Option<u64>,
    ) -> PyResult<PyObject> {
        if width == 0 {
            return Err(PyValueError::new_err("width must be greater than zero"));
        }

        let mut rng = StdRng::seed_from_u64(random_seed.unwrap_or(0xBAD5_EED));
        let encoded_seeds: Vec<usize> = seeds
            .iter()
            .map(|seed| {
                self.node_encode
                    .get(seed)
                    .copied()
                    .ok_or_else(|| PyValueError::new_err(format!("unknown seed node: {seed}")))
            })
            .collect::<PyResult<_>>()?;

        let mut adjacency: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
        for (edge_id, (src, dst, _)) in self.edge_list.iter().enumerate() {
            adjacency.entry(*src).or_default().push((*dst, edge_id));
        }

        let mut seen: HashSet<usize> = encoded_seeds.iter().copied().collect();
        let mut encoded_node_ids = encoded_seeds.clone();
        let mut frontier = encoded_seeds.clone();
        let mut edge_ids_by_layer: Vec<Vec<usize>> = Vec::new();

        for _ in 0..depth {
            let mut next_frontier = Vec::new();
            let mut layer_edges = Vec::new();
            for node in &frontier {
                let Some(neighbors) = adjacency.get(node) else {
                    continue;
                };
                let selected = if neighbors.len() > width {
                    sample_uniform(neighbors, width, &mut rng)
                } else {
                    neighbors.clone()
                };
                for (dst, edge_id) in selected {
                    layer_edges.push(edge_id);
                    if seen.insert(dst) {
                        encoded_node_ids.push(dst);
                        next_frontier.push(dst);
                    }
                }
            }
            edge_ids_by_layer.push(layer_edges);
            if next_frontier.is_empty() {
                break;
            }
            frontier = next_frontier;
        }

        let out = PyDict::new(py);
        out.set_item("encoded_seeds", encoded_seeds)?;
        out.set_item("encoded_node_ids", encoded_node_ids)?;
        out.set_item("edge_ids_by_layer", edge_ids_by_layer)?;
        Ok(out.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_edges() -> Vec<EdgeTuple> {
        vec![
            (
                "a".to_owned(),
                "b".to_owned(),
                1,
                1,
                "txn".to_owned(),
                "device".to_owned(),
                "uses".to_owned(),
                1,
            ),
            (
                "a".to_owned(),
                "c".to_owned(),
                1,
                1,
                "txn".to_owned(),
                "ip".to_owned(),
                "from".to_owned(),
                1,
            ),
            (
                "b".to_owned(),
                "d".to_owned(),
                2,
                0,
                "device".to_owned(),
                "card".to_owned(),
                "seen".to_owned(),
                0,
            ),
        ]
    }

    #[test]
    fn graph_data_samples_budget_neighbors() {
        let graph = GraphData::from_edge_tuples(sample_edges()).expect("graph");
        pyo3::prepare_freethreaded_python();
        Python::with_gil(|py| {
            let obj = graph
                .sample(py, vec!["a".to_owned()], 2, 2, 10, Some(7))
                .expect("sample");
            let dict = obj.bind(py).downcast::<PyDict>().expect("dict");
            let timestamps: HashMap<String, i64> = dict
                .get_item("node_timestamps")
                .expect("item")
                .expect("timestamps")
                .extract()
                .expect("extract");
            assert!(timestamps.contains_key("a"));
            assert!(timestamps.contains_key("b"));
            assert!(timestamps.contains_key("c"));
        });
    }

    #[test]
    fn naive_graph_encodes_reverse_edges() {
        let graph = NaiveHetGraph::from_edge_tuples(sample_edges(), true).expect("graph");
        assert_eq!(graph.node_count(), 4);
        assert_eq!(graph.edge_count(), 6);
        assert_eq!(graph.edge_type_encode().get("_self"), Some(&0));
    }
}
