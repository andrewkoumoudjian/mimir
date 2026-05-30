//! Trainable detector model.
//!
//! The model module contains a compact logistic detector used by the training
//! stack and exposed through `XFraudModel`.
// Rust guideline compliant 2026-02-21

/// Linear binary classifier with sigmoid probabilities.
#[derive(Clone, Debug)]
pub(crate) struct LinearModel {
    pub(crate) weights: Vec<f64>,
    pub(crate) bias: f64,
}

impl LinearModel {
    /// Creates a zero-initialized model.
    pub(crate) fn new(dim: usize) -> Self {
        Self {
            weights: vec![0.0; dim],
            bias: 0.0,
        }
    }

    /// Scores a feature vector as a probability.
    pub(crate) fn predict_probability(&self, features: &[f64]) -> f64 {
        sigmoid(self.logit(features))
    }

    /// Returns the raw model logit.
    pub(crate) fn logit(&self, features: &[f64]) -> f64 {
        self.weights
            .iter()
            .zip(features)
            .map(|(weight, value)| weight * value)
            .sum::<f64>()
            + self.bias
    }
}

pub(crate) fn sigmoid(value: f64) -> f64 {
    if value >= 0.0 {
        let exp = (-value).exp();
        1.0 / (1.0 + exp)
    } else {
        let exp = value.exp();
        exp / (1.0 + exp)
    }
}
