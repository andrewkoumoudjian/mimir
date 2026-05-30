//! Feature vector storage primitives.
//!
//! The store provides xFraud-style keyed feature vectors without requiring
//! LevelDB, keeping local builds dependency-free beyond Rust crates.
// Rust guideline compliant 2026-02-21

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;

use pyo3::exceptions::{PyIOError, PyValueError};
use pyo3::prelude::*;

/// Stores dense feature vectors by string key.
///
/// The optional `path` points to a compact binary file used by `save` and
/// loaded during construction when it already exists.
#[pyclass]
#[derive(Clone, Debug, Default)]
pub struct FeatureStore {
    path: Option<PathBuf>,
    values: HashMap<String, Vec<f32>>,
}

#[pymethods]
impl FeatureStore {
    /// Creates a feature store and optionally loads it from disk.
    ///
    /// # Errors
    /// Returns an error when the path exists but cannot be read.
    #[new]
    #[pyo3(signature = (path=None))]
    fn new(path: Option<String>) -> PyResult<Self> {
        let path_buf = path.map(PathBuf::from);
        let values = if let Some(path) = &path_buf {
            if path.exists() {
                read_store(path)?
            } else {
                HashMap::new()
            }
        } else {
            HashMap::new()
        };
        Ok(Self {
            path: path_buf,
            values,
        })
    }

    /// Inserts a feature vector.
    fn put(&mut self, key: String, value: Vec<f32>) {
        self.values.insert(key, value);
    }

    /// Returns a feature vector or `default_value`.
    #[pyo3(signature = (key, default_value=None))]
    fn get(&self, key: String, default_value: Option<Vec<f32>>) -> Option<Vec<f32>> {
        self.values.get(&key).cloned().or(default_value)
    }

    /// Returns the number of stored vectors.
    fn len(&self) -> usize {
        self.values.len()
    }

    /// Returns true when no vectors are stored.
    fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Returns sorted store keys.
    fn keys(&self) -> Vec<String> {
        let mut keys: Vec<String> = self.values.keys().cloned().collect();
        keys.sort();
        keys
    }

    /// Saves the store to its configured path or `path`.
    ///
    /// # Errors
    /// Returns an error when no path is available or the file cannot be written.
    #[pyo3(signature = (path=None))]
    fn save(&mut self, path: Option<String>) -> PyResult<()> {
        if let Some(path) = path {
            self.path = Some(PathBuf::from(path));
        }
        let Some(path) = &self.path else {
            return Err(PyValueError::new_err("FeatureStore.save requires a path"));
        };
        write_store(path, &self.values)
    }
}

fn read_u64(cursor: &mut &[u8]) -> PyResult<u64> {
    if cursor.len() < 8 {
        return Err(PyValueError::new_err("truncated feature store"));
    }
    let (bytes, rest) = cursor.split_at(8);
    *cursor = rest;
    let mut out = [0u8; 8];
    out.copy_from_slice(bytes);
    Ok(u64::from_le_bytes(out))
}

fn read_store(path: &PathBuf) -> PyResult<HashMap<String, Vec<f32>>> {
    let mut file = File::open(path).map_err(|err| PyIOError::new_err(err.to_string()))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|err| PyIOError::new_err(err.to_string()))?;
    let mut cursor: &[u8] = &bytes;
    let count = read_u64(&mut cursor)? as usize;
    let mut values = HashMap::with_capacity(count);

    for _ in 0..count {
        let key_len = read_u64(&mut cursor)? as usize;
        if cursor.len() < key_len {
            return Err(PyValueError::new_err("truncated feature store key"));
        }
        let (key_bytes, rest) = cursor.split_at(key_len);
        cursor = rest;
        let key = String::from_utf8(key_bytes.to_vec())
            .map_err(|err| PyValueError::new_err(err.to_string()))?;

        let value_len = read_u64(&mut cursor)? as usize;
        let byte_len = value_len
            .checked_mul(4)
            .ok_or_else(|| PyValueError::new_err("feature vector is too large"))?;
        if cursor.len() < byte_len {
            return Err(PyValueError::new_err("truncated feature store vector"));
        }
        let (value_bytes, rest) = cursor.split_at(byte_len);
        cursor = rest;
        let mut value = Vec::with_capacity(value_len);
        for chunk in value_bytes.chunks_exact(4) {
            let mut out = [0u8; 4];
            out.copy_from_slice(chunk);
            value.push(f32::from_le_bytes(out));
        }
        values.insert(key, value);
    }
    Ok(values)
}

fn write_store(path: &PathBuf, values: &HashMap<String, Vec<f32>>) -> PyResult<()> {
    let mut file = File::create(path).map_err(|err| PyIOError::new_err(err.to_string()))?;
    file.write_all(&(values.len() as u64).to_le_bytes())
        .map_err(|err| PyIOError::new_err(err.to_string()))?;

    let mut keys: Vec<&String> = values.keys().collect();
    keys.sort();
    for key in keys {
        let key_bytes = key.as_bytes();
        file.write_all(&(key_bytes.len() as u64).to_le_bytes())
            .map_err(|err| PyIOError::new_err(err.to_string()))?;
        file.write_all(key_bytes)
            .map_err(|err| PyIOError::new_err(err.to_string()))?;

        if let Some(value) = values.get(key) {
            file.write_all(&(value.len() as u64).to_le_bytes())
                .map_err(|err| PyIOError::new_err(err.to_string()))?;
            for item in value {
                file.write_all(&item.to_le_bytes())
                    .map_err(|err| PyIOError::new_err(err.to_string()))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_store_round_trips_vectors() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("features.bin");
        let mut store = FeatureStore::new(Some(path.display().to_string())).expect("store");
        store.put("node-1".to_owned(), vec![1.0, 2.5]);
        store.save(None).expect("save");

        let loaded = FeatureStore::new(Some(path.display().to_string())).expect("load");
        assert_eq!(loaded.get("node-1".to_owned(), None), Some(vec![1.0, 2.5]));
    }
}
