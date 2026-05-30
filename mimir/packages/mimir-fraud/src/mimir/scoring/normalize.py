"""Normalization helpers for feature-to-score transforms."""

from __future__ import annotations

import math
from statistics import median
from typing import Iterable

import numpy as np


def clip01(value: float) -> float:
    """Clamp a numeric value into the inclusive 0-1 range."""

    if math.isnan(value) or math.isinf(value):
        return 0.0
    return max(0.0, min(1.0, float(value)))


def scale_above(value: float, start: float, full: float) -> float:
    """Map values at or below start to 0 and values at or above full to 1."""

    if full <= start:
        return 0.0
    return clip01((float(value) - start) / (full - start))


def percentile_rank(values: Iterable[float]) -> list[float]:
    """Return stable percentile ranks in 0-1 order for the input values."""

    values_list = list(values)
    if not values_list:
        return []
    order = sorted(range(len(values_list)), key=lambda index: values_list[index])
    ranks = [0.0] * len(values_list)
    denominator = max(1, len(values_list) - 1)
    for rank, index in enumerate(order):
        ranks[index] = rank / denominator
    return ranks


def robust_median_mad(values: Iterable[float]) -> tuple[float, float]:
    """Return median and median absolute deviation for a numeric sequence."""

    values_list = [float(value) for value in values]
    if not values_list:
        return 0.0, 0.0
    med = float(median(values_list))
    mad = float(median(abs(value - med) for value in values_list))
    return med, mad


def robust_z(value: float, med: float, mad: float, epsilon: float = 1e-9) -> float:
    """Compute a robust z score using median absolute deviation."""

    return (float(value) - med) / (1.4826 * mad + epsilon)


def weighted_mean(parts: list[tuple[float, float]]) -> float:
    """Compute a clipped weighted mean from (value, weight) tuples."""

    total_weight = sum(weight for _, weight in parts)
    if total_weight <= 0:
        return 0.0
    return clip01(sum(clip01(value) * weight for value, weight in parts) / total_weight)


def sigmoid(value: float, midpoint: float, scale: float) -> float:
    """Smoothly map a value to 0-1 around a midpoint."""

    if scale <= 0:
        return 0.0
    return clip01(float(1 / (1 + np.exp(-(value - midpoint) / scale))))
