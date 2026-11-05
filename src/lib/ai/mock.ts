// Test/evaluation-only adapter. Never imported by the runtime API route.
import { fieldKeys, type Fixture, type Extraction } from "../schemas";
import type { ExtractionProvider } from "./provider";
export class MockProvider implements ExtractionProvider {
  readonly mode = "mock_test" as const;
  constructor(private fixture: Fixture) {}
  usage() {
    return { modelCalls: 0, totalTokens: 0 };
  }
  async identifyDocument() {
    return {
      documentType: this.fixture.documentType,
      readable: !this.fixture.expectedRejection,
      reason: this.fixture.expectedRejection,
    };
  }
  async extractDocumentFields() {
    return {
      fields: Object.fromEntries(
        fieldKeys.map((key) => [
          key,
          {
            rawValue: this.fixture.fields[key],
            confidence: this.fixture.fields[key] === null ? "low" : "high",
            pageNumber: 1,
            evidenceLocation:
              this.fixture.fields[key] === null
                ? null
                : `Row ${fieldKeys.indexOf(key) + 1}`,
            reason: this.fixture.fields[key] === null ? "missing" : null,
          },
        ]),
      ),
    } as Extraction;
  }
}
