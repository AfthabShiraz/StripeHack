import type { Claim, RawDoc } from "../types";
import { c004791 } from "./claims/c004791";
import { c004817 } from "./claims/c004817";
import { c004833 } from "./claims/c004833";
import { c004861 } from "./claims/c004861";
import { COMPANY_DOCS } from "./generated-docs";

export const CLAIMS: Claim[] = [c004817, c004861, c004791, c004833];

export const LIVE_CLAIM_ID = c004817.id;

export function getClaim(id: string) {
  return CLAIMS.find((c) => c.id === id);
}

export function findDoc(claim: Claim | undefined, id: string): RawDoc | undefined {
  return claim?.documents.find((d) => d.id === id) ?? COMPANY_DOCS.find((d) => d.id === id);
}

export { COMPANY_DOCS };
