//! Python-facing xFraud detector training.
//!
//! The training stack mirrors xFraud's detector loop with time splits,
//! mini-batches, sampled graph context, and validation-based early stopping.
// Rust guideline compliant 2026-02-21

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyDict;
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};

use crate::graph::{EdgeTuple, HetGraph};
use crate::metrics::{binary_metrics, BinaryMetrics};
use crate::model::LinearModel;

const DEFAULT_WIDTH: usize = 16;
const DEFAULT_DEPTH: usize = 2;
const DEFAULT_POSITIVE_PER_BATCH: usize = 64;
const DEFAULT_NEGATIVE_PER_BATCH: usize = 16;
const DEFAULT_N_BATCH: usize = 32;
const DEFAULT_MAX_EPOCHS: usize = 20;
const DEFAULT_PATIENCE: usize = 5;
const DEFAULT_LEARNING_RATE: f64 = 0.05;
const DEFAULT_L2: f64 = 0.0001;
const DEFAULT_RANDOM_SEED: u64 = 2020;
const DEFAULT_TRAIN_RATIO: f64 = 0.7;
const DEFAULT_VALID_RATIO: f64 = 0.9;

/// Configuration for xFraud-style Rust training.
///
/// The defaults follow the reference detector shape while staying small enough
/// for local CPU experiments.
#[pyclass]
#[derive(Clone, Debug)]
pub struct TrainingConfig {
    /// Maximum sampled neighbors per frontier node.
    #[pyo3(get)]
    pub width: usize,
    /// Number of sampling hops around each seed.
    #[pyo3(get)]
    pub depth: usize,
    /// Positive seeds requested for each training batch.
    #[pyo3(get)]
    pub positive_per_batch: usize,
    /// Negative seeds requested for each training batch.
    #[pyo3(get)]
    pub negative_per_batch: usize,
    /// Number of mini-batches per epoch.
    #[pyo3(get)]
    pub n_batch: usize,
    /// Maximum training epochs.
    #[pyo3(get)]
    pub max_epochs: usize,
    /// Validation epochs without AUC improvement before stopping.
    #[pyo3(get)]
    pub patience: usize,
    /// Initial learning rate.
    #[pyo3(get)]
    pub learning_rate: f64,
    /// L2 regularization strength.
    #[pyo3(get)]
    pub l2: f64,
    /// Random seed used for sampling and training.
    #[pyo3(get)]
    pub random_seed: u64,
    /// Neighbor sampling method.
    #[pyo3(get)]
    pub sample_method: String,
    /// Detector feature mode.
    #[pyo3(get)]
    pub conv_name: String,
    /// Fraction of timestamp-ordered seeds used for training.
    #[pyo3(get)]
    pub train_ratio: f64,
    /// Fraction of timestamp-ordered seeds used before test split.
    #[pyo3(get)]
    pub valid_ratio: f64,
}

impl Default for TrainingConfig {
    fn default() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            depth: DEFAULT_DEPTH,
            positive_per_batch: DEFAULT_POSITIVE_PER_BATCH,
            negative_per_batch: DEFAULT_NEGATIVE_PER_BATCH,
            n_batch: DEFAULT_N_BATCH,
            max_epochs: DEFAULT_MAX_EPOCHS,
            patience: DEFAULT_PATIENCE,
            learning_rate: DEFAULT_LEARNING_RATE,
            l2: DEFAULT_L2,
            random_seed: DEFAULT_RANDOM_SEED,
            sample_method: "sage".to_owned(),
            conv_name: "sage-mean".to_owned(),
            train_ratio: DEFAULT_TRAIN_RATIO,
            valid_ratio: DEFAULT_VALID_RATIO,
        }
    }
}

#[pymethods]
impl TrainingConfig {
    /// Creates a training configuration.
    ///
    /// # Errors
    /// Returns an error when a numeric parameter is outside its supported range.
    #[new]
    #[pyo3(signature = (
        width=DEFAULT_WIDTH,
        depth=DEFAULT_DEPTH,
        positive_per_batch=DEFAULT_POSITIVE_PER_BATCH,
        negative_per_batch=DEFAULT_NEGATIVE_PER_BATCH,
        n_batch=DEFAULT_N_BATCH,
        max_epochs=DEFAULT_MAX_EPOCHS,
        patience=DEFAULT_PATIENCE,
        learning_rate=DEFAULT_LEARNING_RATE,
        l2=DEFAULT_L2,
        random_seed=DEFAULT_RANDOM_SEED,
        sample_method="sage",
        conv_name="sage-mean",
        train_ratio=DEFAULT_TRAIN_RATIO,
        valid_ratio=DEFAULT_VALID_RATIO
    ))]
    fn new(
        width: usize,
        depth: usize,
        positive_per_batch: usize,
        negative_per_batch: usize,
        n_batch: usize,
        max_epochs: usize,
        patience: usize,
        learning_rate: f64,
        l2: f64,
        random_seed: u64,
        sample_method: &str,
        conv_name: &str,
        train_ratio: f64,
        valid_ratio: f64,
    ) -> PyResult<Self> {
        let config = Self {
            width,
            depth,
            positive_per_batch,
            negative_per_batch,
            n_batch,
            max_epochs,
            patience,
            learning_rate,
            l2,
            random_seed,
            sample_method: sample_method.to_owned(),
            conv_name: conv_name.to_owned(),
            train_ratio,
            valid_ratio,
        };
        config.validate()?;
        Ok(config)
    }

    /// Returns the configuration as a Python dictionary.
    ///
    /// # Errors
    /// Returns an error when Python cannot allocate the dictionary.
    fn as_dict(&self, py: Python<'_>) -> PyResult<PyObject> {
        config_to_dict(py, self)
    }
}

impl TrainingConfig {
    fn validate(&self) -> PyResult<()> {
        if self.width == 0 {
            return Err(PyValueError::new_err("width must be greater than zero"));
        }
        if self.positive_per_batch + self.negative_per_batch == 0 {
            return Err(PyValueError::new_err(
                "at least one batch class count must be greater than zero",
            ));
        }
        if self.n_batch == 0 {
            return Err(PyValueError::new_err("n_batch must be greater than zero"));
        }
        if self.max_epochs == 0 {
            return Err(PyValueError::new_err(
                "max_epochs must be greater than zero",
            ));
        }
        if self.learning_rate <= 0.0 || !self.learning_rate.is_finite() {
            return Err(PyValueError::new_err(
                "learning_rate must be a positive finite number",
            ));
        }
        if self.l2 < 0.0 || !self.l2.is_finite() {
            return Err(PyValueError::new_err(
                "l2 must be a finite non-negative number",
            ));
        }
        if !(0.0..1.0).contains(&self.train_ratio) {
            return Err(PyValueError::new_err("train_ratio must be in (0, 1)"));
        }
        if !(self.train_ratio..1.0).contains(&self.valid_ratio) {
            return Err(PyValueError::new_err(
                "valid_ratio must be greater than train_ratio and less than 1",
            ));
        }
        if !matches!(self.conv_name.as_str(), "logi" | "sage" | "sage-mean" | "") {
            return Err(PyValueError::new_err(
                "conv_name must be one of: logi, sage, sage-mean",
            ));
        }
        if !matches!(
            self.sample_method.as_str(),
            "sage"
                | "sage-merged"
                | "dw-sage"
                | "dw-sage-merged"
                | "dw0-ntw1-sage"
                | "dw1-ntw0-sage"
        ) {
            return Err(PyValueError::new_err(
                "sample_method must be sage or a supported degree-weighted sage variant",
            ));
        }
        Ok(())
    }

    fn uses_graph_context(&self) -> bool {
        !matches!(self.conv_name.as_str(), "logi" | "")
    }
}

/// xFraud training data encoded for Rust.
///
/// Construct this from xFraud edge tuples and a node feature dictionary.
#[pyclass]
#[derive(Clone, Debug)]
pub struct XFraudTrainingData {
    graph: HetGraph,
    features: HashMap<String, Vec<f32>>,
    feature_dim: usize,
}

#[pymethods]
impl XFraudTrainingData {
    /// Builds training data from xFraud edge tuples and feature vectors.
    ///
    /// Edge tuples use `(src, dst, ts, src_label, src_type, dst_type,
    /// graph_edge_type, seed)`. Feature keys must match graph node ids.
    ///
    /// # Errors
    /// Returns an error when graph rows or feature vectors are invalid.
    #[staticmethod]
    fn from_edge_tuples(
        edge_tuples: Vec<EdgeTuple>,
        features: HashMap<String, Vec<f32>>,
    ) -> PyResult<Self> {
        let graph = HetGraph::from_edge_tuples(edge_tuples).map_err(PyValueError::new_err)?;
        let Some(feature_dim) = features
            .values()
            .find(|values| !values.is_empty())
            .map(Vec::len)
        else {
            return Err(PyValueError::new_err(
                "features must contain at least one non-empty vector",
            ));
        };

        Ok(Self {
            graph,
            features,
            feature_dim,
        })
    }

    /// Returns the number of graph nodes.
    fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Returns the number of graph edges.
    fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    /// Returns the number of edge types.
    fn edge_type_count(&self) -> usize {
        self.graph.edge_type_count()
    }

    /// Returns the number of labeled seed nodes.
    fn seed_count(&self) -> usize {
        self.graph.seeds.len()
    }

    /// Returns the inferred feature dimension.
    fn feature_dim(&self) -> usize {
        self.feature_dim
    }

    /// Returns seed node identifiers.
    fn seed_ids(&self) -> Vec<String> {
        self.graph
            .seeds
            .iter()
            .map(|idx| self.graph.node_ids[*idx].clone())
            .collect()
    }
}

/// Trains Rust xFraud detector models.
#[pyclass]
#[derive(Clone, Debug)]
pub struct XFraudTrainer {
    config: TrainingConfig,
}

#[pymethods]
impl XFraudTrainer {
    /// Creates a trainer with default configuration.
    #[new]
    fn new() -> Self {
        Self {
            config: TrainingConfig::default(),
        }
    }

    /// Creates a trainer from an explicit configuration.
    #[staticmethod]
    fn from_config(config: PyRef<'_, TrainingConfig>) -> Self {
        Self {
            config: config.clone(),
        }
    }

    /// Returns this trainer's configuration.
    ///
    /// # Errors
    /// Returns an error when Python cannot allocate the dictionary.
    fn config(&self, py: Python<'_>) -> PyResult<PyObject> {
        config_to_dict(py, &self.config)
    }

    /// Trains a detector and returns the fitted model.
    ///
    /// # Errors
    /// Returns an error when the training data has no labeled seeds.
    fn train(&self, data: PyRef<'_, XFraudTrainingData>) -> PyResult<XFraudModel> {
        self.config.validate()?;
        train_model(&data, &self.config)
    }
}

/// Fitted Rust xFraud detector.
#[pyclass]
#[derive(Clone, Debug)]
pub struct XFraudModel {
    model: LinearModel,
    mean: Vec<f64>,
    std: Vec<f64>,
    config: TrainingConfig,
    report: TrainingReport,
}

#[pymethods]
impl XFraudModel {
    /// Predicts fraud probabilities for all seed nodes.
    ///
    /// # Errors
    /// Returns an error when features cannot be encoded.
    fn predict_proba(&self, data: PyRef<'_, XFraudTrainingData>) -> Vec<(String, f64)> {
        let examples = build_examples(&data, &self.config);
        examples
            .into_iter()
            .map(|mut example| {
                apply_normalizer(&mut example.features, &self.mean, &self.std);
                (
                    example.node_id,
                    self.model.predict_probability(&example.features),
                )
            })
            .collect()
    }

    /// Returns training, validation, and test metrics.
    ///
    /// # Errors
    /// Returns an error when Python cannot allocate dictionaries.
    fn metrics(&self, py: Python<'_>) -> PyResult<PyObject> {
        report_to_dict(py, &self.report)
    }

    /// Returns model weights and normalization state.
    ///
    /// # Errors
    /// Returns an error when Python cannot allocate the dictionary.
    fn state(&self, py: Python<'_>) -> PyResult<PyObject> {
        let out = PyDict::new(py);
        out.set_item("weights", self.model.weights.clone())?;
        out.set_item("bias", self.model.bias)?;
        out.set_item("mean", self.mean.clone())?;
        out.set_item("std", self.std.clone())?;
        out.set_item("config", config_to_dict(py, &self.config)?)?;
        Ok(out.into())
    }
}

#[derive(Clone, Debug)]
struct Example {
    node_idx: usize,
    node_id: String,
    label: f64,
    features: Vec<f64>,
}

#[derive(Clone, Debug)]
struct TrainingReport {
    train: BinaryMetrics,
    valid: BinaryMetrics,
    test: BinaryMetrics,
    epochs: usize,
    feature_dim: usize,
    node_count: usize,
    edge_count: usize,
    train_count: usize,
    valid_count: usize,
    test_count: usize,
}

fn train_model(data: &XFraudTrainingData, config: &TrainingConfig) -> PyResult<XFraudModel> {
    let mut examples = build_examples(data, config);
    if examples.is_empty() {
        return Err(PyValueError::new_err(
            "training data contains no labeled seeds",
        ));
    }

    let (train_nodes, valid_nodes, test_nodes) = data
        .graph
        .seed_splits(config.train_ratio, config.valid_ratio);
    let train_positions = positions_for_nodes(&examples, &train_nodes);
    let valid_positions = positions_for_nodes(&examples, &valid_nodes);
    let test_positions = positions_for_nodes(&examples, &test_nodes);
    if train_positions.is_empty() {
        return Err(PyValueError::new_err(
            "training split contains no labeled seeds",
        ));
    }

    let (mean, std) = fit_normalizer(&examples, &train_positions);
    for example in &mut examples {
        apply_normalizer(&mut example.features, &mean, &std);
    }

    let mut model = LinearModel::new(examples[0].features.len());
    let mut best_model = model.clone();
    let mut best_auc = f64::NEG_INFINITY;
    let mut epochs_without_improvement = 0usize;
    let mut rng = StdRng::seed_from_u64(config.random_seed);
    let mut epochs_run = 0usize;

    let positive_positions: Vec<usize> = train_positions
        .iter()
        .copied()
        .filter(|idx| examples[*idx].label >= 0.5)
        .collect();
    let negative_positions: Vec<usize> = train_positions
        .iter()
        .copied()
        .filter(|idx| examples[*idx].label < 0.5)
        .collect();

    for epoch in 0..config.max_epochs {
        epochs_run = epoch + 1;
        let learning_rate = cosine_learning_rate(config.learning_rate, epoch, config.max_epochs);
        for _ in 0..config.n_batch {
            let batch = sample_batch(
                &train_positions,
                &positive_positions,
                &negative_positions,
                config,
                &mut rng,
            );
            train_batch(&mut model, &examples, &batch, learning_rate, config.l2);
        }

        let valid_metrics = evaluate(&model, &examples, &valid_positions);
        if valid_metrics.auc > best_auc + 1e-12 {
            best_auc = valid_metrics.auc;
            best_model = model.clone();
            epochs_without_improvement = 0;
        } else {
            epochs_without_improvement += 1;
            if epochs_without_improvement >= config.patience {
                break;
            }
        }
    }

    model = best_model;
    let report = TrainingReport {
        train: evaluate(&model, &examples, &train_positions),
        valid: evaluate(&model, &examples, &valid_positions),
        test: evaluate(&model, &examples, &test_positions),
        epochs: epochs_run,
        feature_dim: examples[0].features.len(),
        node_count: data.graph.node_count(),
        edge_count: data.graph.edge_count(),
        train_count: train_positions.len(),
        valid_count: valid_positions.len(),
        test_count: test_positions.len(),
    };

    Ok(XFraudModel {
        model,
        mean,
        std,
        config: config.clone(),
        report,
    })
}

fn build_examples(data: &XFraudTrainingData, config: &TrainingConfig) -> Vec<Example> {
    data.graph
        .seeds
        .iter()
        .filter_map(|node_idx| {
            let label = data.graph.labels[*node_idx]?;
            Some(Example {
                node_idx: *node_idx,
                node_id: data.graph.node_ids[*node_idx].clone(),
                label: if label > 0 { 1.0 } else { 0.0 },
                features: build_feature_vector(data, *node_idx, config),
            })
        })
        .collect()
}

fn build_feature_vector(
    data: &XFraudTrainingData,
    node_idx: usize,
    config: &TrainingConfig,
) -> Vec<f64> {
    let node_id = &data.graph.node_ids[node_idx];
    let base = feature_for(&data.features, node_id, data.feature_dim);
    if !config.uses_graph_context() {
        return base;
    }

    let mut rng = StdRng::seed_from_u64(node_seed(config.random_seed, node_id));
    let context = data.graph.sample_context(
        node_idx,
        config.depth,
        config.width,
        &config.sample_method,
        &mut rng,
    );
    let mut aggregate = vec![0.0; data.feature_dim];
    if !context.is_empty() {
        for context_idx in &context {
            let values = feature_for(
                &data.features,
                &data.graph.node_ids[*context_idx],
                data.feature_dim,
            );
            for (out, value) in aggregate.iter_mut().zip(values) {
                *out += value;
            }
        }
        let denom = context.len() as f64;
        for value in &mut aggregate {
            *value /= denom;
        }
    }

    let mut out = Vec::with_capacity(data.feature_dim * 2 + 3);
    out.extend(base);
    out.extend(aggregate);
    out.push((data.graph.degree(node_idx) as f64 + 1.0).ln());
    out.push((context.len() as f64 + 1.0).ln());
    out.push(data.graph.node_type_scale(node_idx));
    out
}

fn feature_for(
    features: &HashMap<String, Vec<f32>>,
    node_id: &str,
    feature_dim: usize,
) -> Vec<f64> {
    let mut out = vec![0.0; feature_dim];
    if let Some(values) = features.get(node_id) {
        for (idx, value) in values.iter().take(feature_dim).enumerate() {
            out[idx] = *value as f64;
        }
    }
    out
}

fn node_seed(random_seed: u64, node_id: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    random_seed.hash(&mut hasher);
    node_id.hash(&mut hasher);
    hasher.finish()
}

fn positions_for_nodes(examples: &[Example], nodes: &[usize]) -> Vec<usize> {
    let node_set: std::collections::HashSet<usize> = nodes.iter().copied().collect();
    examples
        .iter()
        .enumerate()
        .filter_map(|(idx, example)| node_set.contains(&example.node_idx).then_some(idx))
        .collect()
}

fn fit_normalizer(examples: &[Example], positions: &[usize]) -> (Vec<f64>, Vec<f64>) {
    let dim = examples[0].features.len();
    let mut mean = vec![0.0; dim];
    for idx in positions {
        for (out, value) in mean.iter_mut().zip(&examples[*idx].features) {
            *out += *value;
        }
    }
    let denom = positions.len().max(1) as f64;
    for value in &mut mean {
        *value /= denom;
    }

    let mut variance = vec![0.0; dim];
    for idx in positions {
        for ((out, value), mean_value) in
            variance.iter_mut().zip(&examples[*idx].features).zip(&mean)
        {
            let delta = *value - *mean_value;
            *out += delta * delta;
        }
    }
    let std = variance
        .into_iter()
        .map(|value| {
            let candidate = (value / denom).sqrt();
            if candidate.is_finite() && candidate > 1e-12 {
                candidate
            } else {
                1.0
            }
        })
        .collect();

    (mean, std)
}

fn apply_normalizer(features: &mut [f64], mean: &[f64], std: &[f64]) {
    for ((value, mean), std) in features.iter_mut().zip(mean).zip(std) {
        *value = (*value - *mean) / *std;
    }
}

fn sample_batch(
    train_positions: &[usize],
    positive_positions: &[usize],
    negative_positions: &[usize],
    config: &TrainingConfig,
    rng: &mut StdRng,
) -> Vec<usize> {
    let mut batch = Vec::with_capacity(config.positive_per_batch + config.negative_per_batch);
    push_sampled(
        &mut batch,
        positive_positions,
        config.positive_per_batch,
        rng,
    );
    push_sampled(
        &mut batch,
        negative_positions,
        config.negative_per_batch,
        rng,
    );
    if batch.is_empty() {
        push_sampled(
            &mut batch,
            train_positions,
            train_positions.len().max(1),
            rng,
        );
    }
    batch.shuffle(rng);
    batch
}

fn push_sampled(out: &mut Vec<usize>, candidates: &[usize], count: usize, rng: &mut StdRng) {
    if candidates.is_empty() || count == 0 {
        return;
    }
    for _ in 0..count {
        let idx = rng.gen_range(0..candidates.len());
        out.push(candidates[idx]);
    }
}

fn train_batch(
    model: &mut LinearModel,
    examples: &[Example],
    batch: &[usize],
    learning_rate: f64,
    l2: f64,
) {
    if batch.is_empty() {
        return;
    }

    let mut grad_weights = vec![0.0; model.weights.len()];
    let mut grad_bias = 0.0;
    for idx in batch {
        let example = &examples[*idx];
        let probability = model.predict_probability(&example.features);
        let error = probability - example.label;
        for (grad, value) in grad_weights.iter_mut().zip(&example.features) {
            *grad += error * value;
        }
        grad_bias += error;
    }

    let scale = 1.0 / batch.len() as f64;
    for (weight, grad) in model.weights.iter_mut().zip(grad_weights) {
        let regularized_grad = grad * scale + l2 * *weight;
        *weight -= learning_rate * regularized_grad;
    }
    model.bias -= learning_rate * grad_bias * scale;
}

fn cosine_learning_rate(start: f64, epoch: usize, max_epochs: usize) -> f64 {
    let end = start * 0.002;
    let progress = epoch as f64 / max_epochs.max(1) as f64;
    end + 0.5 * (start - end) * (1.0 + (std::f64::consts::PI * progress).cos())
}

fn evaluate(model: &LinearModel, examples: &[Example], positions: &[usize]) -> BinaryMetrics {
    if positions.is_empty() {
        return BinaryMetrics {
            auc: 0.5,
            ..BinaryMetrics::default()
        };
    }
    let labels: Vec<f64> = positions.iter().map(|idx| examples[*idx].label).collect();
    let probabilities: Vec<f64> = positions
        .iter()
        .map(|idx| model.predict_probability(&examples[*idx].features))
        .collect();
    binary_metrics(&labels, &probabilities)
}

fn config_to_dict(py: Python<'_>, config: &TrainingConfig) -> PyResult<PyObject> {
    let out = PyDict::new(py);
    out.set_item("width", config.width)?;
    out.set_item("depth", config.depth)?;
    out.set_item("positive_per_batch", config.positive_per_batch)?;
    out.set_item("negative_per_batch", config.negative_per_batch)?;
    out.set_item("n_batch", config.n_batch)?;
    out.set_item("max_epochs", config.max_epochs)?;
    out.set_item("patience", config.patience)?;
    out.set_item("learning_rate", config.learning_rate)?;
    out.set_item("l2", config.l2)?;
    out.set_item("random_seed", config.random_seed)?;
    out.set_item("sample_method", &config.sample_method)?;
    out.set_item("conv_name", &config.conv_name)?;
    out.set_item("train_ratio", config.train_ratio)?;
    out.set_item("valid_ratio", config.valid_ratio)?;
    Ok(out.into())
}

fn report_to_dict(py: Python<'_>, report: &TrainingReport) -> PyResult<PyObject> {
    let out = PyDict::new(py);
    out.set_item("train", metrics_to_dict(py, &report.train)?)?;
    out.set_item("valid", metrics_to_dict(py, &report.valid)?)?;
    out.set_item("test", metrics_to_dict(py, &report.test)?)?;
    out.set_item("epochs", report.epochs)?;
    out.set_item("feature_dim", report.feature_dim)?;
    out.set_item("node_count", report.node_count)?;
    out.set_item("edge_count", report.edge_count)?;
    out.set_item("train_count", report.train_count)?;
    out.set_item("valid_count", report.valid_count)?;
    out.set_item("test_count", report.test_count)?;
    Ok(out.into())
}

fn metrics_to_dict(py: Python<'_>, metrics: &BinaryMetrics) -> PyResult<PyObject> {
    let out = PyDict::new(py);
    out.set_item("loss", metrics.loss)?;
    out.set_item("accuracy", metrics.accuracy)?;
    out.set_item("auc", metrics.auc)?;
    out.set_item("ap", metrics.average_precision)?;
    out.set_item("count", metrics.count)?;
    Ok(out.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trainer_fits_separable_seed_features() {
        let data = sample_data();
        let config = TrainingConfig {
            max_epochs: 35,
            n_batch: 8,
            positive_per_batch: 2,
            negative_per_batch: 2,
            patience: 10,
            learning_rate: 0.1,
            conv_name: "sage-mean".to_owned(),
            ..TrainingConfig::default()
        };
        let model = train_model(&data, &config).expect("model");
        assert!(model.report.train.auc >= 0.9);

        let scored: Vec<(String, f64)> = build_examples(&data, &config)
            .into_iter()
            .map(|mut example| {
                apply_normalizer(&mut example.features, &model.mean, &model.std);
                (
                    example.node_id,
                    model.model.predict_probability(&example.features),
                )
            })
            .collect();
        let fraud_score = scored
            .iter()
            .find(|(node_id, _)| node_id == "tx_fraud_4")
            .map(|(_, score)| *score)
            .expect("fraud score");
        let normal_score = scored
            .iter()
            .find(|(node_id, _)| node_id == "tx_normal_1")
            .map(|(_, score)| *score)
            .expect("normal score");
        assert!(fraud_score > normal_score);
    }

    fn sample_data() -> XFraudTrainingData {
        let mut edge_tuples = Vec::new();
        let mut features = HashMap::new();
        for idx in 0..8 {
            let tx = format!("tx_normal_{idx}");
            edge_tuples.push(edge(&tx, &format!("card_n_{idx}"), idx, 0));
            edge_tuples.push(edge(&tx, "merchant_low", idx, 0));
            features.insert(tx, vec![0.05, 1.0, 0.0]);
        }
        for idx in 0..8 {
            let tx = format!("tx_fraud_{idx}");
            edge_tuples.push(edge(&tx, &format!("card_f_{idx}"), idx + 10, 1));
            edge_tuples.push(edge(&tx, "merchant_high", idx + 10, 1));
            features.insert(tx, vec![3.0, 0.0, 1.0]);
        }
        features.insert("merchant_low".to_owned(), vec![0.0, 1.0, 0.0]);
        features.insert("merchant_high".to_owned(), vec![2.0, 0.0, 1.0]);

        XFraudTrainingData::from_edge_tuples(edge_tuples, features).expect("data")
    }

    fn edge(src: &str, dst: &str, ts: i64, label: i64) -> EdgeTuple {
        (
            src.to_owned(),
            dst.to_owned(),
            ts,
            label,
            "transaction".to_owned(),
            "entity".to_owned(),
            "linked".to_owned(),
            1,
        )
    }
}
