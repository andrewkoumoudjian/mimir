//! Binary classification metrics.
//!
//! The module keeps detector reporting independent from Python and model code.
// Rust guideline compliant 2026-02-21

/// Aggregated binary classification metrics.
#[derive(Clone, Debug, Default)]
pub(crate) struct BinaryMetrics {
    pub(crate) loss: f64,
    pub(crate) accuracy: f64,
    pub(crate) auc: f64,
    pub(crate) average_precision: f64,
    pub(crate) count: usize,
}

/// Computes binary metrics from labels and probabilities.
pub(crate) fn binary_metrics(labels: &[f64], probabilities: &[f64]) -> BinaryMetrics {
    if labels.is_empty() {
        return BinaryMetrics {
            auc: 0.5,
            ..BinaryMetrics::default()
        };
    }

    let mut loss = 0.0;
    let mut correct = 0usize;
    for (label, probability) in labels.iter().zip(probabilities) {
        let p = probability.clamp(1e-12, 1.0 - 1e-12);
        loss += -label * p.ln() - (1.0 - label) * (1.0 - p).ln();
        let predicted = if p >= 0.5 { 1.0 } else { 0.0 };
        if (predicted - label).abs() < f64::EPSILON {
            correct += 1;
        }
    }

    BinaryMetrics {
        loss: loss / labels.len() as f64,
        accuracy: correct as f64 / labels.len() as f64,
        auc: auc_pairwise(labels, probabilities),
        average_precision: average_precision(labels, probabilities),
        count: labels.len(),
    }
}

fn auc_pairwise(labels: &[f64], probabilities: &[f64]) -> f64 {
    let positives: Vec<f64> = labels
        .iter()
        .zip(probabilities)
        .filter_map(|(label, probability)| (*label >= 0.5).then_some(*probability))
        .collect();
    let negatives: Vec<f64> = labels
        .iter()
        .zip(probabilities)
        .filter_map(|(label, probability)| (*label < 0.5).then_some(*probability))
        .collect();

    if positives.is_empty() || negatives.is_empty() {
        return 0.5;
    }

    let mut wins = 0.0;
    for positive in &positives {
        for negative in &negatives {
            if positive > negative {
                wins += 1.0;
            } else if (*positive - *negative).abs() < f64::EPSILON {
                wins += 0.5;
            }
        }
    }
    wins / (positives.len() * negatives.len()) as f64
}

fn average_precision(labels: &[f64], probabilities: &[f64]) -> f64 {
    let mut pairs: Vec<(f64, f64)> = labels
        .iter()
        .copied()
        .zip(probabilities.iter().copied())
        .collect();
    pairs.sort_by(|(_, left), (_, right)| {
        right.partial_cmp(left).unwrap_or(std::cmp::Ordering::Equal)
    });

    let positives = pairs.iter().filter(|(label, _)| *label >= 0.5).count();
    if positives == 0 {
        return 0.0;
    }

    let mut seen_positive = 0usize;
    let mut precision_sum = 0.0;
    for (idx, (label, _)) in pairs.iter().enumerate() {
        if *label >= 0.5 {
            seen_positive += 1;
            precision_sum += seen_positive as f64 / (idx + 1) as f64;
        }
    }
    precision_sum / positives as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_rank_perfect_scores() {
        let labels = [0.0, 1.0, 0.0, 1.0];
        let scores = [0.1, 0.9, 0.2, 0.8];
        let metrics = binary_metrics(&labels, &scores);
        assert_eq!(metrics.auc, 1.0);
        assert_eq!(metrics.average_precision, 1.0);
    }
}
