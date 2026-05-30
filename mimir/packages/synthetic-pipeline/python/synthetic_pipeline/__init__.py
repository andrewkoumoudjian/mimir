"""Rust-backed synthetic transaction generation."""

from ._native import TransactionProfile, generate_transactions

__all__ = ["TransactionProfile", "generate_transactions"]
