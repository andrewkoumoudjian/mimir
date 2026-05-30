# Policy Document Location

Place the Brim expense policy source document here for assistant grounding.

Preferred filename:
- `brim-expense-policy.pdf`

Required runtime companion:
- `brim-expense-policy.txt`

The current hackathon-safe assistant path reads the extracted text file at runtime.
Keep the PDF in the same folder as the provenance source document, and keep the
text file as the deterministic server-readable version derived from that PDF.

The assistant route will refuse to use handwritten policy snippets as its grounding source.
