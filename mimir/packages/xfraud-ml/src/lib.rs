//! Rust xFraud-style ML and training primitives.
//!
//! The crate exposes a dependency-light port of the xFraud detector training
//! shell through Python bindings.
// Rust guideline compliant 2026-02-21

mod graph;
mod metrics;
mod model;
mod training;

use pyo3::prelude::*;

use training::{TrainingConfig, XFraudModel, XFraudTrainer, XFraudTrainingData};

/// Registers the Python extension module.
///
/// # Errors
/// Returns an error when Python fails to register a class.
#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<TrainingConfig>()?;
    m.add_class::<XFraudTrainingData>()?;
    m.add_class::<XFraudTrainer>()?;
    m.add_class::<XFraudModel>()?;
    Ok(())
}
