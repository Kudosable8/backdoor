"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseCsv } from "@/lib/features/imports/csv";
import type {
  ImportFieldMapping,
  ImportHistoryRow,
  ImportPreviewResult,
  SavedImportMapping,
} from "@/lib/features/imports/types";
import { IMPORT_FIELD_DEFINITIONS } from "@/lib/features/imports/types";

const PREVIEW_ROW_LIMIT = 8;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ImportsManagerProps = {
  history: ImportHistoryRow[];
  savedMappings: SavedImportMapping[];
};

export function ImportsManager({
  history,
  savedMappings,
}: ImportsManagerProps) {
  const router = useRouter();
  const [isSavingMapping, startSaveMappingTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [mappingName, setMappingName] = useState("");
  const [mapping, setMapping] = useState<ImportFieldMapping>({});
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(
    null,
  );
  const [skipExistingDuplicates, setSkipExistingDuplicates] = useState(true);

  const hasCsvLoaded = fileContent.length > 0;
  const canSubmit = hasCsvLoaded && Object.keys(mapping).length > 0;
  const previewRows = useMemo(
    () => sampleRows.slice(0, PREVIEW_ROW_LIMIT),
    [sampleRows],
  );

  const onSelectFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Only CSV files are supported for MVP.");
      return;
    }

    const content = await file.text();
    const parsed = parseCsv(content);

    setFileContent(content);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setSampleRows(parsed.rows);
    setPreviewResult(null);
    toast.success("CSV loaded", {
      description: `${parsed.rows.length} data rows detected.`,
    });
  };

  const handleSaveMapping = () => {
    startSaveMappingTransition(async () => {
      try {
        const response = await fetch("/api/imports/mappings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mapping,
            name: mappingName.trim(),
          }),
        });

        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to save mapping");
        }

        setMappingName("");
        toast.success("Mapping saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save mapping");
      }
    });
  };

  const handleValidatePreview = () => {
    startSubmitTransition(async () => {
      try {
        const response = await fetch("/api/imports/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: fileContent,
            fileName,
            mapping,
          }),
        });

        const result = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<ImportPreviewResult>)
          | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to validate import");
        }

        const preview = result as ImportPreviewResult;

        setPreviewResult(preview);
        toast.success("Import preview ready", {
          description: `${preview.readyRows} ready, ${preview.invalidRows} invalid, ${preview.duplicateRows} duplicates (${preview.existingDuplicateRows} already imported, ${preview.inFileDuplicateRows} in this CSV).`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to validate import",
        );
      }
    });
  };

  const handleConfirmImport = () => {
    startSubmitTransition(async () => {
      try {
        const response = await fetch("/api/imports/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: fileContent,
            fileName,
            mapping,
            skipExistingDuplicates,
          }),
        });

        const result = (await response.json().catch(() => null)) as {
          error?: string;
          importId?: string;
          invalidRows?: number;
          validRows?: number;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to complete import");
        }

        toast.success("Import completed", {
          description: `${result?.validRows ?? 0} valid rows imported, ${result?.invalidRows ?? 0} failed.`,
        });
        setPreviewResult(null);
        setFileContent("");
        setFileName("");
        setHeaders([]);
        setSampleRows([]);
        setMapping({});
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to complete import",
        );
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Upload CSV</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV, inspect the columns visually, then map them into the
            platform schema before import.
          </p>
        </div>
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void onSelectFile(event.target.files?.[0] ?? null);
              }}
            />
          </div>
          {fileName ? (
            <p className="text-sm text-muted-foreground">
              Loaded <span className="font-medium text-foreground">{fileName}</span>{" "}
              with {sampleRows.length} rows.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Saved mappings</h2>
          <p className="text-sm text-muted-foreground">
            Apply a saved mapping template or save the current one for future CSVs.
          </p>
        </div>
        <div className="grid gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {savedMappings.length > 0 ? (
              savedMappings.map((savedMapping) => (
                <Button
                  key={savedMapping.id}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMapping(savedMapping.field_mapping_json);
                    toast.success(`Applied mapping: ${savedMapping.name}`);
                  }}
                >
                  {savedMapping.name}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved mappings yet.
              </p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-2">
              <Label htmlFor="mapping-name">Save current mapping as</Label>
              <Input
                id="mapping-name"
                value={mappingName}
                onChange={(event) => setMappingName(event.target.value)}
                placeholder="e.g. Bullhorn export"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                disabled={!mappingName.trim() || !canSubmit || isSavingMapping}
                onClick={handleSaveMapping}
              >
                {isSavingMapping ? "Saving..." : "Save mapping"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Column mapping</h2>
          <p className="text-sm text-muted-foreground">
            Map the CSV columns into your internal schema. Required fields must be
            mapped before validation.
          </p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {IMPORT_FIELD_DEFINITIONS.map((field) => (
            <div key={field.key} className="grid gap-2">
              <Label htmlFor={`mapping-${field.key}`}>
                {field.label} {field.required ? "(Required)" : "(Optional)"}
              </Label>
              <Select
                value={mapping[field.key] ?? "__unmapped__"}
                onValueChange={(value) =>
                  setMapping((current) => ({
                    ...current,
                    [field.key]: value === "__unmapped__" ? undefined : value,
                  }))
                }
              >
                <SelectTrigger id={`mapping-${field.key}`} className="w-full">
                  <SelectValue placeholder="Choose a CSV column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unmapped__">Not mapped</SelectItem>
                  {headers.map((header) => (
                    <SelectItem key={`${field.key}-${header}`} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">CSV preview</h2>
          <p className="text-sm text-muted-foreground">
            Raw row preview so you can visually confirm the source columns before import.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.length > 0 ? (
                previewRows.map((row, index) => (
                  <TableRow key={`preview-${index}`}>
                    {headers.map((header) => (
                      <TableCell key={`${index}-${header}`}>{row[header] || "—"}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(headers.length, 1)}
                    className="text-sm text-muted-foreground"
                  >
                    Load a CSV to see the raw row preview.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canSubmit || isSubmitting} onClick={handleValidatePreview}>
          {isSubmitting ? "Validating..." : "Validate import"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!previewResult || isSubmitting}
          onClick={handleConfirmImport}
        >
          {isSubmitting ? "Importing..." : "Confirm import"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={skipExistingDuplicates}
            onChange={(event) => setSkipExistingDuplicates(event.target.checked)}
          />
          Skip already imported rows
        </label>
      </div>

      {previewResult ? (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">Validation result</h2>
            <p className="text-sm text-muted-foreground">
              Valid rows will import. Invalid rows and duplicates are shown below
              with the reason.
            </p>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Total rows</p>
              <p className="text-2xl font-semibold">{previewResult.totalRows}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Ready</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {previewResult.readyRows}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Invalid</p>
              <p className="text-2xl font-semibold text-amber-600">
                {previewResult.invalidRows}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Duplicates</p>
              <p className="text-2xl font-semibold text-sky-600">
                {previewResult.duplicateRows}
              </p>
            </div>
          </div>
          <div className="grid gap-4 px-4 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">
                Already Imported
              </p>
              <p className="text-xl font-semibold text-sky-600">
                {previewResult.existingDuplicateRows}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">
                Duplicate In CSV
              </p>
              <p className="text-xl font-semibold text-sky-600">
                {previewResult.inFileDuplicateRows}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto p-4 pt-0">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Introduced Role</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewResult.rows.slice(0, 25).map((row) => (
                  <TableRow key={`validated-${row.rowNumber}`}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell className="capitalize">{row.rowStatus}</TableCell>
                    <TableCell>{row.normalized.candidate_full_name ?? "—"}</TableCell>
                    <TableCell>{row.normalized.client_company_name ?? "—"}</TableCell>
                    <TableCell>{row.normalized.introduced_role ?? "—"}</TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {row.errors.join(" ") || "Ready to import."}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Import history</h2>
          <p className="text-sm text-muted-foreground">
            Recent CSV imports for this agency.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Rows</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Invalid</TableHead>
                <TableHead>Duplicates</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length > 0 ? (
                history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.original_filename}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.row_count}</TableCell>
                    <TableCell>{row.valid_row_count}</TableCell>
                    <TableCell>{row.invalid_row_count}</TableCell>
                    <TableCell>{row.duplicate_row_count}</TableCell>
                    <TableCell>{dateFormatter.format(new Date(row.created_at))}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No imports yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
