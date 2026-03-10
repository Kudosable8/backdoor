import { z } from "zod";

import { IMPORT_FIELD_DEFINITIONS } from "./types";

export const importFieldMappingSchema = z.object(
  Object.fromEntries(
    IMPORT_FIELD_DEFINITIONS.map((field) => [
      field.key,
      z.string().trim().min(1).optional(),
    ]),
  ),
);
