//! Stateful transaction feature processing.
//!
//! The processor computes graph and collective features as transactions arrive,
//! avoiding look-ahead while preserving the current Mimir feature semantics.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet, VecDeque};

use chrono::{DateTime, NaiveDateTime};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyDict;

const ONE_HOUR_SECS: i64 = 60 * 60;
const DAY_SECS: i64 = 24 * ONE_HOUR_SECS;

#[derive(Clone, Debug)]
struct SeenTransaction {
    timestamp: i64,
    card_id: String,
    merchant_name: String,
    device_id: String,
    ip_address: String,
}

fn ip_prefix(ip_address: &str) -> String {
    let mut parts = ip_address.split('.');
    match (parts.next(), parts.next()) {
        (Some(a), Some(b)) => format!("{a}.{b}"),
        _ => ip_address.to_owned(),
    }
}

fn parse_timestamp(timestamp: &str) -> PyResult<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(timestamp) {
        return Ok(dt.timestamp());
    }
    NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%dT%H:%M:%S")
        .map(|dt| dt.and_utc().timestamp())
        .map_err(|err| PyValueError::new_err(format!("invalid timestamp {timestamp}: {err}")))
}

/// Processes transactions into streaming graph features.
///
/// This class is intended for continuous pipelines where only prior and current
/// transactions are available.
#[pyclass]
#[derive(Clone, Debug, Default)]
pub struct TransactionProcessor {
    device_cards: HashMap<String, HashSet<String>>,
    ip_cards: HashMap<String, HashSet<String>>,
    merchant_cards: HashMap<String, HashSet<String>>,
    cluster_counts: HashMap<(String, String, String), usize>,
    recent: VecDeque<SeenTransaction>,
    processed_rows: usize,
}

#[pymethods]
impl TransactionProcessor {
    /// Creates an empty transaction processor.
    #[new]
    fn new() -> Self {
        Self::default()
    }

    /// Returns how many transactions have been processed.
    fn processed_rows(&self) -> usize {
        self.processed_rows
    }

    /// Clears all accumulated state.
    fn reset(&mut self) {
        *self = Self::default();
    }

    /// Processes one transaction and returns graph/collective features.
    ///
    /// # Errors
    /// Returns an error when `timestamp` cannot be parsed.
    #[expect(
        clippy::too_many_arguments,
        reason = "Python transaction schema is flat"
    )]
    #[pyo3(signature = (
        transaction_id,
        timestamp,
        card_id,
        amount,
        merchant_name,
        merchant_category,
        channel,
        cardholder_country,
        merchant_country,
        device_id=None,
        ip_address=None
    ))]
    fn process_transaction(
        &mut self,
        py: Python<'_>,
        transaction_id: String,
        timestamp: String,
        card_id: String,
        amount: f64,
        merchant_name: String,
        merchant_category: String,
        channel: String,
        cardholder_country: String,
        merchant_country: String,
        device_id: Option<String>,
        ip_address: Option<String>,
    ) -> PyResult<PyObject> {
        let timestamp_secs = parse_timestamp(&timestamp)?;
        let device = device_id.unwrap_or_default();
        let ip = ip_address.unwrap_or_default();

        if !device.is_empty() {
            self.device_cards
                .entry(device.clone())
                .or_default()
                .insert(card_id.clone());
        }
        if !ip.is_empty() {
            self.ip_cards
                .entry(ip.clone())
                .or_default()
                .insert(card_id.clone());
        }
        self.merchant_cards
            .entry(merchant_name.clone())
            .or_default()
            .insert(card_id.clone());
        let cluster_key = (
            merchant_name.clone(),
            merchant_category.clone(),
            merchant_country.clone(),
        );
        *self.cluster_counts.entry(cluster_key.clone()).or_insert(0) += 1;

        self.recent.push_back(SeenTransaction {
            timestamp: timestamp_secs,
            card_id: card_id.clone(),
            merchant_name: merchant_name.clone(),
            device_id: device.clone(),
            ip_address: ip.clone(),
        });
        while self
            .recent
            .front()
            .map(|row| timestamp_secs - row.timestamp > DAY_SECS)
            .unwrap_or(false)
        {
            self.recent.pop_front();
        }
        self.processed_rows += 1;

        let ip_prefix_value = if ip.is_empty() {
            String::new()
        } else {
            ip_prefix(&ip)
        };
        let rows_24h: Vec<&SeenTransaction> = self
            .recent
            .iter()
            .filter(|row| {
                timestamp_secs >= row.timestamp && timestamp_secs - row.timestamp <= DAY_SECS
            })
            .collect();
        let rows_60m: Vec<&SeenTransaction> = self
            .recent
            .iter()
            .filter(|row| {
                timestamp_secs >= row.timestamp && timestamp_secs - row.timestamp <= ONE_HOUR_SECS
            })
            .collect();

        let merchant_24h: Vec<&SeenTransaction> = rows_24h
            .iter()
            .copied()
            .filter(|row| row.merchant_name == merchant_name)
            .collect();
        let device_24h: Vec<&SeenTransaction> = rows_24h
            .iter()
            .copied()
            .filter(|row| !device.is_empty() && row.device_id == device)
            .collect();
        let ip_24h: Vec<&SeenTransaction> = rows_24h
            .iter()
            .copied()
            .filter(|row| !ip.is_empty() && row.ip_address == ip)
            .collect();
        let prefix_60m: Vec<&SeenTransaction> = rows_60m
            .iter()
            .copied()
            .filter(|row| {
                !ip_prefix_value.is_empty() && ip_prefix(&row.ip_address) == ip_prefix_value
            })
            .collect();

        let merchant_unique_cards_60m = rows_60m
            .iter()
            .filter(|row| row.merchant_name == merchant_name)
            .map(|row| row.card_id.clone())
            .collect::<HashSet<_>>()
            .len();
        let merchant_tx_count_60m = rows_60m
            .iter()
            .filter(|row| row.merchant_name == merchant_name)
            .count();
        let cluster_count = *self.cluster_counts.get(&cluster_key).unwrap_or(&0);
        let rare_cluster = cluster_count <= 4;
        let merchant_burst_score = ((merchant_unique_cards_60m as f64 - 2.0) / 6.0
            + (merchant_tx_count_60m as f64 - 3.0) / 18.0)
            .clamp(0.0, 1.0);

        let out = PyDict::new(py);
        out.set_item("transaction_id", transaction_id)?;
        out.set_item("timestamp", timestamp)?;
        out.set_item("timestamp_unix", timestamp_secs)?;
        out.set_item("card_id", card_id)?;
        out.set_item("amount", amount)?;
        out.set_item("merchant_name", merchant_name.clone())?;
        out.set_item("merchant_category", merchant_category)?;
        out.set_item("channel", channel)?;
        out.set_item("cardholder_country", cardholder_country)?;
        out.set_item("merchant_country", merchant_country.clone())?;
        out.set_item("device_id", device.clone())?;
        out.set_item("ip_address", ip.clone())?;
        out.set_item(
            "device_unique_cards_total",
            self.device_cards
                .get(&device)
                .map(HashSet::len)
                .unwrap_or(0),
        )?;
        out.set_item(
            "ip_unique_cards_total",
            self.ip_cards.get(&ip).map(HashSet::len).unwrap_or(0),
        )?;
        out.set_item(
            "merchant_unique_cards_total",
            self.merchant_cards
                .get(&merchant_name)
                .map(HashSet::len)
                .unwrap_or(0),
        )?;
        out.set_item(
            "device_unique_cards_24h",
            device_24h
                .iter()
                .map(|row| row.card_id.clone())
                .collect::<HashSet<_>>()
                .len(),
        )?;
        out.set_item(
            "ip_unique_cards_24h",
            ip_24h
                .iter()
                .map(|row| row.card_id.clone())
                .collect::<HashSet<_>>()
                .len(),
        )?;
        out.set_item(
            "merchant_unique_cards_24h",
            merchant_24h
                .iter()
                .map(|row| row.card_id.clone())
                .collect::<HashSet<_>>()
                .len(),
        )?;
        out.set_item(
            "merchant_burst_score",
            (merchant_burst_score * 10_000.0).round() / 10_000.0,
        )?;
        out.set_item(
            "shared_device_with_other_cards",
            !device.is_empty()
                && self
                    .device_cards
                    .get(&device)
                    .map(|cards| cards.len() > 1)
                    .unwrap_or(false),
        )?;
        out.set_item(
            "shared_ip_with_other_cards",
            !ip.is_empty()
                && self
                    .ip_cards
                    .get(&ip)
                    .map(|cards| cards.len() > 1)
                    .unwrap_or(false),
        )?;
        out.set_item(
            "unusual_merchant_hit_by_many_cards",
            merchant_unique_cards_60m >= 5 && merchant_tx_count_60m >= 5,
        )?;
        out.set_item("merchant_category_country_cluster_rarity", rare_cluster)?;
        out.set_item("merchant_category_country_cluster_count", cluster_count)?;
        out.set_item("ip_prefix", ip_prefix_value)?;
        out.set_item(
            "ip_prefix_unique_cards_60m",
            prefix_60m
                .iter()
                .map(|row| row.card_id.clone())
                .collect::<HashSet<_>>()
                .len(),
        )?;
        out.set_item("ip_prefix_tx_count_60m", prefix_60m.len())?;
        Ok(out.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn processor_detects_shared_device() {
        pyo3::prepare_freethreaded_python();
        Python::with_gil(|py| {
            let mut processor = TransactionProcessor::new();
            processor
                .process_transaction(
                    py,
                    "tx1".to_owned(),
                    "2026-04-25T00:00:00".to_owned(),
                    "card1".to_owned(),
                    10.0,
                    "Merchant".to_owned(),
                    "online_retail".to_owned(),
                    "online".to_owned(),
                    "CA".to_owned(),
                    "CA".to_owned(),
                    Some("dev1".to_owned()),
                    Some("10.1.1.1".to_owned()),
                )
                .expect("first");
            let obj = processor
                .process_transaction(
                    py,
                    "tx2".to_owned(),
                    "2026-04-25T00:10:00".to_owned(),
                    "card2".to_owned(),
                    11.0,
                    "Merchant".to_owned(),
                    "online_retail".to_owned(),
                    "online".to_owned(),
                    "CA".to_owned(),
                    "CA".to_owned(),
                    Some("dev1".to_owned()),
                    Some("10.1.1.2".to_owned()),
                )
                .expect("second");
            let dict = obj.bind(py).downcast::<PyDict>().expect("dict");
            assert_eq!(
                dict.get_item("shared_device_with_other_cards")
                    .expect("item")
                    .expect("value")
                    .extract::<bool>()
                    .expect("bool"),
                true
            );
            assert_eq!(processor.processed_rows(), 2);
        });
    }
}
