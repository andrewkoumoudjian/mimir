// Deterministic policy constants remain here for the rule engines.
// The assistant prompt no longer treats this file as the source policy document.
export const BRIM_POLICY = {
  preAuthorizationThreshold: 50,
  preAuthorizationReference:
    "Brim policy: all expenses over $50.00 must be pre-authorized by your manager.",
  receiptsReference:
    "Brim policy: receipts are required before any expense is reimbursed.",
  cardFeeReference:
    "Brim policy: Brim pays the fee for the individual corporate card, but fees for other personal credit cards are not reimbursed.",
  abuseReference:
    "Brim policy: abuse of the expense policy, including falsifying expense reports, is expressly prohibited.",
} as const;
