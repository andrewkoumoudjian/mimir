import { access, readFile } from "node:fs/promises";
import path from "node:path";

export type PolicyDocumentChunk = {
  id: string;
  text: string;
};

export type PolicyDocument = {
  sourcePath: string;
  sourceType: "pdf" | "text";
  rawText: string;
  chunks: PolicyDocumentChunk[];
};

const POLICY_DIRECTORY = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "policy");
const POLICY_PDF_PATH = path.join(POLICY_DIRECTORY, "brim-expense-policy.pdf");
const POLICY_TEXT_PATH = path.join(POLICY_DIRECTORY, "brim-expense-policy.txt");

export async function loadPolicyDocument(): Promise<PolicyDocument | null> {
  const source = await resolvePolicySourcePath();

  if (!source) {
    return null;
  }

  const rawText = await readFile(source.sourcePath, "utf8");

  const normalizedText = normalizePolicyText(rawText);
  const chunks = buildPolicyChunks(normalizedText);

  if (!normalizedText || chunks.length === 0) {
    return null;
  }

  return {
    sourcePath: source.sourcePath,
    sourceType: source.sourceType,
    rawText: normalizedText,
    chunks,
  };
}

export function getExpectedPolicyDocumentPaths() {
  return {
    pdfPath: POLICY_PDF_PATH,
    textPath: POLICY_TEXT_PATH,
  };
}

async function resolvePolicySourcePath() {
  if (await fileExists(POLICY_TEXT_PATH)) {
    return { sourcePath: POLICY_TEXT_PATH, sourceType: "text" as const };
  }

  if (await fileExists(POLICY_PDF_PATH)) {
    return null;
  }

  return null;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePolicyText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPolicyChunks(text: string): PolicyDocumentChunk[] {
  return text
    .split(/\n{2,}|(?<=[.?!])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 30)
    .map((part, index) => ({
      id: `policy-chunk-${index + 1}`,
      text: part,
    }));
}
