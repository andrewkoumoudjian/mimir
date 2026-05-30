//! Rust primitives for Mimir transaction intelligence.
//!
//! The crate exposes xFraud-inspired graph, explanation, feature-store, and
//! streaming transaction primitives through a Python extension module.
// Rust guideline compliant 2026-02-21

mod explain;
mod feature_store;
mod graph;
mod stream;

use pyo3::prelude::*;

use explain::{
    average_node_importance, combine_edge_weight, edge_betweenness_centrality, edge_importance,
    line_graph_degree_centrality, topk_hitrate,
};
use feature_store::FeatureStore;
use graph::{GraphData, NaiveHetGraph};
use stream::TransactionProcessor;

/// Registers the Python extension module.
///
/// # Errors
/// Returns an error when Python fails to register a class or function.
#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<GraphData>()?;
    m.add_class::<NaiveHetGraph>()?;
    m.add_class::<FeatureStore>()?;
    m.add_class::<TransactionProcessor>()?;
    m.add_function(wrap_pyfunction!(average_node_importance, m)?)?;
    m.add_function(wrap_pyfunction!(combine_edge_weight, m)?)?;
    m.add_function(wrap_pyfunction!(edge_betweenness_centrality, m)?)?;
    m.add_function(wrap_pyfunction!(edge_importance, m)?)?;
    m.add_function(wrap_pyfunction!(line_graph_degree_centrality, m)?)?;
    m.add_function(wrap_pyfunction!(topk_hitrate, m)?)?;
    Ok(())
}
