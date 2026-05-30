//! Explanation and centrality scoring primitives.
//!
//! These functions port xFraud's edge-importance aggregation, top-k hit-rate,
//! and centrality baselines into Rust.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet, VecDeque};

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::SeedableRng;

type CommunityEdge = (String, String, i64);
type WeightedEdge = (String, String, i64, f64, f64);

fn canonical_edge(src: &str, dst: &str) -> (String, String) {
    if src <= dst {
        (src.to_owned(), dst.to_owned())
    } else {
        (dst.to_owned(), src.to_owned())
    }
}

/// Averages non-NaN annotation scores.
///
/// # Errors
/// This function does not return errors.
#[pyfunction]
pub fn average_node_importance(annotations: Vec<f64>) -> f64 {
    let mut sum = 0.0;
    let mut count = 0.0;
    for value in annotations {
        if value.is_finite() {
            sum += value;
            count += 1.0;
        }
    }
    if count == 0.0 {
        0.0
    } else {
        sum / count
    }
}

/// Aggregates endpoint node importance into edge importance.
///
/// # Errors
/// Returns an error when `aggregation` is not `min`, `avg`, or `sum`.
#[pyfunction]
pub fn edge_importance(
    src_importance: f64,
    dst_importance: f64,
    aggregation: &str,
) -> PyResult<f64> {
    match aggregation {
        "min" => Ok(src_importance.min(dst_importance)),
        "avg" => Ok((src_importance + dst_importance) / 2.0),
        "sum" => Ok(src_importance + dst_importance),
        _ => Err(PyValueError::new_err(
            "aggregation must be one of: min, avg, sum",
        )),
    }
}

/// Combines explainer and centrality weights.
///
/// # Errors
/// This function does not return errors.
#[pyfunction]
pub fn combine_edge_weight(
    explainer_weight: f64,
    centrality_weight: f64,
    centrality_w: f64,
) -> f64 {
    (1.0 - centrality_w) * explainer_weight + centrality_w * centrality_weight
}

/// Computes line-graph degree centrality for community edges.
///
/// The return tuples are `(src, dst, community_id, score)` in input order.
///
/// # Errors
/// This function does not return errors.
#[pyfunction]
pub fn line_graph_degree_centrality(edges: Vec<CommunityEdge>) -> Vec<(String, String, i64, f64)> {
    let mut by_community: HashMap<i64, Vec<(usize, String, String)>> = HashMap::new();
    for (idx, (src, dst, community_id)) in edges.iter().cloned().enumerate() {
        by_community
            .entry(community_id)
            .or_default()
            .push((idx, src, dst));
    }

    let mut scores = vec![0.0; edges.len()];
    for community_edges in by_community.values() {
        let mut degree: HashMap<&str, usize> = HashMap::new();
        for (_, src, dst) in community_edges {
            *degree.entry(src.as_str()).or_insert(0) += 1;
            *degree.entry(dst.as_str()).or_insert(0) += 1;
        }
        let denom = community_edges.len().saturating_sub(1).max(1) as f64;
        for (idx, src, dst) in community_edges {
            let line_degree = degree.get(src.as_str()).copied().unwrap_or(0)
                + degree.get(dst.as_str()).copied().unwrap_or(0)
                - 2;
            scores[*idx] = line_degree as f64 / denom;
        }
    }

    edges
        .into_iter()
        .enumerate()
        .map(|(idx, (src, dst, community_id))| (src, dst, community_id, scores[idx]))
        .collect()
}

/// Computes normalized edge betweenness centrality by community.
///
/// The return tuples are `(src, dst, community_id, score)` in input order.
///
/// # Errors
/// This function does not return errors.
#[pyfunction]
pub fn edge_betweenness_centrality(edges: Vec<CommunityEdge>) -> Vec<(String, String, i64, f64)> {
    let mut by_community: HashMap<i64, Vec<(usize, String, String)>> = HashMap::new();
    for (idx, (src, dst, community_id)) in edges.iter().cloned().enumerate() {
        by_community
            .entry(community_id)
            .or_default()
            .push((idx, src, dst));
    }

    let mut scores = vec![0.0; edges.len()];
    for community_edges in by_community.values() {
        let community_scores = betweenness_for_edges(community_edges);
        for (idx, src, dst) in community_edges {
            let key = canonical_edge(src, dst);
            scores[*idx] = community_scores.get(&key).copied().unwrap_or(0.0);
        }
    }

    edges
        .into_iter()
        .enumerate()
        .map(|(idx, (src, dst, community_id))| (src, dst, community_id, scores[idx]))
        .collect()
}

fn betweenness_for_edges(edges: &[(usize, String, String)]) -> HashMap<(String, String), f64> {
    let mut node_index = HashMap::<String, usize>::new();
    let mut nodes = Vec::<String>::new();
    let mut edge_keys = Vec::<(String, String)>::new();
    let mut seen_edges = HashSet::<(String, String)>::new();

    for (_, src, dst) in edges {
        for node in [src, dst] {
            if !node_index.contains_key(node) {
                node_index.insert(node.clone(), nodes.len());
                nodes.push(node.clone());
            }
        }
        let key = canonical_edge(src, dst);
        if seen_edges.insert(key.clone()) {
            edge_keys.push(key);
        }
    }

    let mut edge_index = HashMap::<(usize, usize), usize>::new();
    let mut adjacency = vec![Vec::<(usize, usize)>::new(); nodes.len()];
    for (idx, (src, dst)) in edge_keys.iter().enumerate() {
        let u = node_index[src];
        let v = node_index[dst];
        edge_index.insert((u, v), idx);
        edge_index.insert((v, u), idx);
        adjacency[u].push((v, idx));
        adjacency[v].push((u, idx));
    }

    let n = nodes.len();
    let mut edge_scores = vec![0.0; edge_keys.len()];
    for source in 0..n {
        let mut stack = Vec::<usize>::new();
        let mut predecessors = vec![Vec::<(usize, usize)>::new(); n];
        let mut sigma = vec![0.0; n];
        let mut distance = vec![-1isize; n];
        sigma[source] = 1.0;
        distance[source] = 0;

        let mut queue = VecDeque::from([source]);
        while let Some(v) = queue.pop_front() {
            stack.push(v);
            for (w, edge_id) in &adjacency[v] {
                if distance[*w] < 0 {
                    queue.push_back(*w);
                    distance[*w] = distance[v] + 1;
                }
                if distance[*w] == distance[v] + 1 {
                    sigma[*w] += sigma[v];
                    predecessors[*w].push((v, *edge_id));
                }
            }
        }

        let mut delta = vec![0.0; n];
        while let Some(w) = stack.pop() {
            for (v, edge_id) in &predecessors[w] {
                if sigma[w] > 0.0 {
                    let contribution = (sigma[*v] / sigma[w]) * (1.0 + delta[w]);
                    edge_scores[*edge_id] += contribution;
                    delta[*v] += contribution;
                }
            }
        }
    }

    let normalizer = if n > 1 {
        2.0 / (n as f64 * (n as f64 - 1.0))
    } else {
        0.0
    };
    edge_keys
        .into_iter()
        .enumerate()
        .map(|(idx, key)| (key, (edge_scores[idx] / 2.0) * normalizer))
        .collect()
}

/// Computes xFraud top-k hit-rate averaged across communities.
///
/// Each edge tuple is `(src, dst, community_id, human_importance, edge_weight)`.
///
/// # Errors
/// Returns an error when `k` or `random_draws` is zero.
#[pyfunction]
#[pyo3(signature = (edge_rows, k, random_draws=100, random_seed=0))]
pub fn topk_hitrate(
    edge_rows: Vec<WeightedEdge>,
    k: usize,
    random_draws: usize,
    random_seed: u64,
) -> PyResult<f64> {
    if k == 0 {
        return Err(PyValueError::new_err("k must be greater than zero"));
    }
    if random_draws == 0 {
        return Err(PyValueError::new_err(
            "random_draws must be greater than zero",
        ));
    }

    let mut by_community: HashMap<i64, Vec<WeightedEdge>> = HashMap::new();
    for row in edge_rows {
        by_community.entry(row.2).or_default().push(row);
    }
    if by_community.is_empty() {
        return Ok(0.0);
    }

    let mut community_scores = Vec::with_capacity(by_community.len());
    for rows in by_community.values() {
        let max_importance = rows
            .iter()
            .map(|(_, _, _, importance, _)| *importance)
            .fold(f64::NEG_INFINITY, f64::max);
        let mut top_human: Vec<(String, String)> = rows
            .iter()
            .filter(|(_, _, _, importance, _)| (*importance - max_importance).abs() <= f64::EPSILON)
            .map(|(src, dst, _, _, _)| canonical_edge(src, dst))
            .collect();
        top_human.sort();
        top_human.dedup();

        let mut explainer_edges: Vec<&WeightedEdge> = rows.iter().collect();
        explainer_edges.sort_by(|a, b| b.4.total_cmp(&a.4));
        let explainer_top: Vec<(String, String)> = explainer_edges
            .into_iter()
            .take(k)
            .map(|(src, dst, _, _, _)| canonical_edge(src, dst))
            .collect();

        let mut draw_scores = Vec::with_capacity(random_draws);
        for draw in 0..random_draws {
            let human_set: HashSet<(String, String)> = if top_human.len() <= k {
                rows.iter()
                    .map(|(src, dst, _, _, _)| canonical_edge(src, dst))
                    .collect()
            } else {
                let mut rng = StdRng::seed_from_u64(random_seed + draw as u64);
                let mut candidates = top_human.clone();
                candidates.shuffle(&mut rng);
                candidates.truncate(k);
                candidates.into_iter().collect()
            };
            let hits = explainer_top
                .iter()
                .filter(|edge| human_set.contains(*edge))
                .count();
            draw_scores.push(hits as f64 / k as f64);
        }
        community_scores.push(draw_scores.iter().sum::<f64>() / draw_scores.len() as f64);
    }

    Ok(community_scores.iter().sum::<f64>() / community_scores.len() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_graph_degree_scores_path_middle_edges() {
        let scores = line_graph_degree_centrality(vec![
            ("a".to_owned(), "b".to_owned(), 0),
            ("b".to_owned(), "c".to_owned(), 0),
        ]);
        assert_eq!(scores[0].3, 1.0);
        assert_eq!(scores[1].3, 1.0);
    }

    #[test]
    fn edge_betweenness_matches_three_node_path() {
        let scores = edge_betweenness_centrality(vec![
            ("a".to_owned(), "b".to_owned(), 0),
            ("b".to_owned(), "c".to_owned(), 0),
        ]);
        assert!((scores[0].3 - 2.0 / 3.0).abs() < 1e-9);
        assert!((scores[1].3 - 2.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn topk_hitrate_accepts_undirected_hits() {
        let score = topk_hitrate(
            vec![
                ("a".to_owned(), "b".to_owned(), 0, 2.0, 0.9),
                ("c".to_owned(), "d".to_owned(), 0, 1.0, 0.1),
            ],
            1,
            5,
            42,
        )
        .expect("hitrate");
        assert_eq!(score, 1.0);
    }
}
