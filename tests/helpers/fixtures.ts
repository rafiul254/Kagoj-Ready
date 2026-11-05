import { manifestSchema, fieldKeys } from "../../src/lib/schemas";
import samples from "../../src/data/samples.json";
import { MockProvider } from "../../src/lib/ai/mock";
import { type CaseDocument, documentSchema } from "../../src/lib/domain/types";
const manifest = manifestSchema.parse(samples);
export async function sampleDoc(id: string): Promise<CaseDocument> {
  const f = manifest.fixtures.find((f) => f.id === id)!;
  const extraction = await new MockProvider(f).extractDocumentFields();
  return documentSchema.parse({
    id,
    label: id,
    documentType: f.documentType,
    extraction,
    reviews: Object.fromEntries(
      fieldKeys.map((k) => [
        k,
        {
          confirmed: true,
          value: extraction.fields[k].rawValue,
          edited: false,
        },
      ]),
    ),
    mode: "synthetic_fixture",
    sampleId: id,
  });
}
