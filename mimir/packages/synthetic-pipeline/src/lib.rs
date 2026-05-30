//! Rust-backed synthetic transaction generation.
//!
//! The crate learns an empirical transaction profile from CSV and exposes
//! Python bindings for batch generation and CSV export.
// Rust guideline compliant 2026-02-21

use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;

use chrono::{DateTime, NaiveDateTime, Utc};
use pyo3::exceptions::{PyIOError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};

const COLUMNS: [&str; 11] = [
    "transaction_id",
    "timestamp",
    "card_id",
    "amount",
    "merchant_name",
    "merchant_category",
    "channel",
    "cardholder_country",
    "merchant_country",
    "device_id",
    "ip_address",
];

#[derive(Clone, Debug)]
struct TransactionRecord {
    transaction_id: String,
    timestamp: String,
    timestamp_secs: i64,
    card_id: String,
    amount: f64,
    merchant_name: String,
    merchant_category: String,
    channel: String,
    cardholder_country: String,
    merchant_country: String,
    device_id: String,
    ip_address: String,
}

impl TransactionRecord {
    fn generated_from(
        template: &Self,
        transaction_id: String,
        timestamp_secs: i64,
        amount: f64,
    ) -> Self {
        Self {
            transaction_id,
            timestamp: format_timestamp(timestamp_secs),
            timestamp_secs,
            card_id: template.card_id.clone(),
            amount,
            merchant_name: template.merchant_name.clone(),
            merchant_category: template.merchant_category.clone(),
            channel: template.channel.clone(),
            cardholder_country: template.cardholder_country.clone(),
            merchant_country: template.merchant_country.clone(),
            device_id: template.device_id.clone(),
            ip_address: template.ip_address.clone(),
        }
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

fn format_timestamp(timestamp_secs: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp_secs, 0)
        .map(|dt| dt.naive_utc().format("%Y-%m-%dT%H:%M:%S").to_string())
        .unwrap_or_else(|| "1970-01-01T00:00:00".to_owned())
}

fn csv_err(err: csv::Error) -> PyErr {
    PyValueError::new_err(err.to_string())
}

fn io_err(err: std::io::Error) -> PyErr {
    PyIOError::new_err(err.to_string())
}

/// Empirical profile learned from transaction CSV rows.
///
/// The profile keeps complete source rows for joint-distribution sampling and
/// secondary distributions for temporal and online identity reuse.
#[pyclass]
#[derive(Clone, Debug)]
pub struct TransactionProfile {
    records: Vec<TransactionRecord>,
    interarrival_secs: Vec<i64>,
    category_amounts: HashMap<String, Vec<f64>>,
    online_devices: Vec<String>,
    online_ips: Vec<String>,
    min_timestamp: i64,
    max_timestamp: i64,
}

#[pymethods]
impl TransactionProfile {
    /// Loads a transaction profile from a CSV file.
    ///
    /// # Errors
    /// Returns an error when the file cannot be read or required fields fail parsing.
    #[staticmethod]
    fn from_csv(path: String) -> PyResult<Self> {
        load_profile(PathBuf::from(path))
    }

    /// Returns the number of source rows in the profile.
    fn source_rows(&self) -> usize {
        self.records.len()
    }

    /// Returns a compact distribution summary.
    ///
    /// # Errors
    /// Returns an error when Python cannot allocate the dictionary.
    fn summary(&self, py: Python<'_>) -> PyResult<PyObject> {
        let mut categories: HashMap<String, usize> = HashMap::new();
        let mut channels: HashMap<String, usize> = HashMap::new();
        let mut cards = std::collections::HashSet::new();
        let mut merchants = std::collections::HashSet::new();

        for record in &self.records {
            *categories
                .entry(record.merchant_category.clone())
                .or_insert(0) += 1;
            *channels.entry(record.channel.clone()).or_insert(0) += 1;
            cards.insert(record.card_id.clone());
            merchants.insert(record.merchant_name.clone());
        }

        let out = PyDict::new(py);
        out.set_item("source_rows", self.records.len())?;
        out.set_item("cards", cards.len())?;
        out.set_item("merchants", merchants.len())?;
        out.set_item("categories", categories)?;
        out.set_item("channels", channels)?;
        out.set_item("min_timestamp", format_timestamp(self.min_timestamp))?;
        out.set_item("max_timestamp", format_timestamp(self.max_timestamp))?;
        Ok(out.into())
    }

    /// Generates transaction dictionaries.
    ///
    /// # Errors
    /// Returns an error when `count` is zero or timestamp parsing fails.
    #[pyo3(signature = (count, random_seed=None, start_timestamp=None, prefix="syn"))]
    fn generate(
        &self,
        py: Python<'_>,
        count: usize,
        random_seed: Option<u64>,
        start_timestamp: Option<String>,
        prefix: &str,
    ) -> PyResult<PyObject> {
        let rows = self.generate_records(count, random_seed, start_timestamp, prefix)?;
        records_to_py(py, &rows)
    }

    /// Writes generated transactions to a CSV file.
    ///
    /// # Errors
    /// Returns an error when generation or writing fails.
    #[pyo3(signature = (path, count, random_seed=None, start_timestamp=None, prefix="syn"))]
    fn write_csv(
        &self,
        path: String,
        count: usize,
        random_seed: Option<u64>,
        start_timestamp: Option<String>,
        prefix: &str,
    ) -> PyResult<String> {
        let rows = self.generate_records(count, random_seed, start_timestamp, prefix)?;
        write_records(PathBuf::from(&path), &rows)?;
        Ok(path)
    }
}

impl TransactionProfile {
    fn generate_records(
        &self,
        count: usize,
        random_seed: Option<u64>,
        start_timestamp: Option<String>,
        prefix: &str,
    ) -> PyResult<Vec<TransactionRecord>> {
        if count == 0 {
            return Err(PyValueError::new_err("count must be greater than zero"));
        }
        if self.records.is_empty() {
            return Err(PyValueError::new_err("profile contains no source rows"));
        }

        let mut rng = StdRng::seed_from_u64(random_seed.unwrap_or(0x5157_5157));
        let mut timestamp = if let Some(start) = start_timestamp {
            parse_timestamp(&start)?
        } else {
            self.max_timestamp + sample_interarrival(&self.interarrival_secs, &mut rng)
        };
        let mut out = Vec::with_capacity(count);

        for idx in 0..count {
            if idx > 0 {
                timestamp += sample_interarrival(&self.interarrival_secs, &mut rng);
            }
            let template = self
                .records
                .choose(&mut rng)
                .ok_or_else(|| PyValueError::new_err("profile contains no source rows"))?;
            let amount = self.sample_amount(&template.merchant_category, template.amount, &mut rng);
            let mut record = TransactionRecord::generated_from(
                template,
                format!("{prefix}_{idx:06}"),
                timestamp,
                amount,
            );
            if record.channel == "online" {
                if rng.gen_bool(0.35) {
                    if let Some(device) = self.online_devices.choose(&mut rng) {
                        record.device_id = device.clone();
                    }
                }
                if rng.gen_bool(0.35) {
                    if let Some(ip) = self.online_ips.choose(&mut rng) {
                        record.ip_address = ip.clone();
                    }
                }
            } else {
                record.device_id.clear();
                record.ip_address.clear();
            }
            out.push(record);
        }
        Ok(out)
    }

    fn sample_amount(&self, category: &str, fallback: f64, rng: &mut StdRng) -> f64 {
        let base = self
            .category_amounts
            .get(category)
            .and_then(|values| values.choose(rng))
            .copied()
            .unwrap_or(fallback);
        let jitter = rng.gen_range(0.85..=1.15);
        ((base * jitter).max(1.0) * 100.0).round() / 100.0
    }
}

/// Generates transactions from a CSV profile in one call.
///
/// # Errors
/// Returns an error when the profile cannot be loaded or generation fails.
#[pyfunction]
#[pyo3(signature = (source_csv, count, random_seed=None, start_timestamp=None, prefix="syn"))]
pub fn generate_transactions(
    py: Python<'_>,
    source_csv: String,
    count: usize,
    random_seed: Option<u64>,
    start_timestamp: Option<String>,
    prefix: &str,
) -> PyResult<PyObject> {
    let profile = load_profile(PathBuf::from(source_csv))?;
    let rows = profile.generate_records(count, random_seed, start_timestamp, prefix)?;
    records_to_py(py, &rows)
}

fn sample_interarrival(values: &[i64], rng: &mut StdRng) -> i64 {
    values.choose(rng).copied().unwrap_or(60).max(1)
}

fn load_profile(path: PathBuf) -> PyResult<TransactionProfile> {
    let mut reader = csv::Reader::from_path(path).map_err(csv_err)?;
    let headers = reader.headers().map_err(csv_err)?.clone();
    for column in COLUMNS {
        if !headers.iter().any(|header| header == column) {
            return Err(PyValueError::new_err(format!("missing column: {column}")));
        }
    }

    let mut records = Vec::new();
    let header_index: HashMap<&str, usize> = COLUMNS
        .iter()
        .filter_map(|column| {
            headers
                .iter()
                .position(|header| header == *column)
                .map(|idx| (*column, idx))
        })
        .collect();

    for row in reader.records() {
        let row = row.map_err(csv_err)?;
        let get = |column: &str| -> String {
            let Some(idx) = header_index.get(column).copied() else {
                return String::new();
            };
            row.get(idx).unwrap_or("").to_owned()
        };
        let timestamp = get("timestamp");
        let amount = get("amount")
            .parse::<f64>()
            .map_err(|err| PyValueError::new_err(format!("invalid amount: {err}")))?;
        records.push(TransactionRecord {
            transaction_id: get("transaction_id"),
            timestamp: timestamp.clone(),
            timestamp_secs: parse_timestamp(&timestamp)?,
            card_id: get("card_id"),
            amount,
            merchant_name: get("merchant_name"),
            merchant_category: get("merchant_category"),
            channel: get("channel"),
            cardholder_country: get("cardholder_country"),
            merchant_country: get("merchant_country"),
            device_id: get("device_id"),
            ip_address: get("ip_address"),
        });
    }

    if records.is_empty() {
        return Err(PyValueError::new_err("source CSV contains no rows"));
    }
    records.sort_by_key(|record| record.timestamp_secs);

    let mut interarrival_secs = Vec::new();
    for pair in records.windows(2) {
        let delta = pair[1].timestamp_secs - pair[0].timestamp_secs;
        if delta > 0 {
            interarrival_secs.push(delta);
        }
    }
    if interarrival_secs.is_empty() {
        interarrival_secs.push(60);
    }

    let mut category_amounts: HashMap<String, Vec<f64>> = HashMap::new();
    let mut online_devices = Vec::new();
    let mut online_ips = Vec::new();
    for record in &records {
        category_amounts
            .entry(record.merchant_category.clone())
            .or_default()
            .push(record.amount);
        if record.channel == "online" {
            if !record.device_id.is_empty() {
                online_devices.push(record.device_id.clone());
            }
            if !record.ip_address.is_empty() {
                online_ips.push(record.ip_address.clone());
            }
        }
    }

    let min_timestamp = records[0].timestamp_secs;
    let max_timestamp = records[records.len() - 1].timestamp_secs;
    Ok(TransactionProfile {
        records,
        interarrival_secs,
        category_amounts,
        online_devices,
        online_ips,
        min_timestamp,
        max_timestamp,
    })
}

fn records_to_py(py: Python<'_>, rows: &[TransactionRecord]) -> PyResult<PyObject> {
    let out = PyList::empty(py);
    for row in rows {
        let item = PyDict::new(py);
        item.set_item("transaction_id", &row.transaction_id)?;
        item.set_item("timestamp", &row.timestamp)?;
        item.set_item("card_id", &row.card_id)?;
        item.set_item("amount", row.amount)?;
        item.set_item("merchant_name", &row.merchant_name)?;
        item.set_item("merchant_category", &row.merchant_category)?;
        item.set_item("channel", &row.channel)?;
        item.set_item("cardholder_country", &row.cardholder_country)?;
        item.set_item("merchant_country", &row.merchant_country)?;
        item.set_item("device_id", &row.device_id)?;
        item.set_item("ip_address", &row.ip_address)?;
        out.append(item)?;
    }
    Ok(out.into())
}

fn write_records(path: PathBuf, rows: &[TransactionRecord]) -> PyResult<()> {
    let file = File::create(path).map_err(io_err)?;
    let mut writer = csv::Writer::from_writer(file);
    writer.write_record(COLUMNS).map_err(csv_err)?;
    for row in rows {
        writer
            .write_record([
                row.transaction_id.as_str(),
                row.timestamp.as_str(),
                row.card_id.as_str(),
                &format!("{:.2}", row.amount),
                row.merchant_name.as_str(),
                row.merchant_category.as_str(),
                row.channel.as_str(),
                row.cardholder_country.as_str(),
                row.merchant_country.as_str(),
                row.device_id.as_str(),
                row.ip_address.as_str(),
            ])
            .map_err(csv_err)?;
    }
    writer.flush().map_err(io_err)
}

/// Registers the Python extension module.
///
/// # Errors
/// Returns an error when Python fails to register a class or function.
#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<TransactionProfile>()?;
    m.add_function(wrap_pyfunction!(generate_transactions, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn sample_csv() -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().expect("tempfile");
        writeln!(
            file,
            "transaction_id,timestamp,card_id,amount,merchant_name,merchant_category,channel,cardholder_country,merchant_country,device_id,ip_address"
        )
        .expect("header");
        writeln!(
            file,
            "tx1,2026-04-25T00:00:00,card1,10.00,Shop,online_retail,online,CA,CA,dev1,10.1.1.1"
        )
        .expect("row1");
        writeln!(
            file,
            "tx2,2026-04-25T00:01:00,card2,20.00,Cafe,restaurant,in_person,CA,CA,,"
        )
        .expect("row2");
        file
    }

    #[test]
    fn profile_generates_requested_count() {
        let file = sample_csv();
        let profile = load_profile(file.path().to_path_buf()).expect("profile");
        let rows = profile
            .generate_records(5, Some(1), Some("2026-04-26T00:00:00".to_owned()), "syn")
            .expect("generate");
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0].transaction_id, "syn_000000");
    }

    #[test]
    fn profile_writes_csv() {
        let file = sample_csv();
        let profile = load_profile(file.path().to_path_buf()).expect("profile");
        let out = tempfile::NamedTempFile::new().expect("tempfile");
        let out_path = out.path().display().to_string();
        profile
            .write_csv(out_path.clone(), 3, Some(2), None, "syn")
            .expect("write");
        let content = std::fs::read_to_string(out_path).expect("read");
        assert_eq!(content.lines().count(), 4);
    }
}
