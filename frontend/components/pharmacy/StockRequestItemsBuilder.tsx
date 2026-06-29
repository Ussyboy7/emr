"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { pharmacyService, type Medication } from "@/lib/services";
import {
  formatPackDisplay,
  requestInputToUnits,
  toDisplayQuantity,
} from "@/lib/pharmacy/stock-request-quantity";
import { Loader2, Minus, Plus, Search, ShoppingCart } from "lucide-react";

const MEDICATION_SEARCH_LIMIT = 20;
const MAX_QUANTITY = 100_000;

export type StockRequestLineItem = {
  medication: number;
  quantity: number;
};

export type StockRequestItemsBuilderProps = {
  items: StockRequestLineItem[];
  onItemsChange: (items: StockRequestLineItem[]) => void;
  medicationCache: Record<number, Medication>;
  onMedicationLearned: (med: Medication) => void;
  /** Pre-select a drug when opening the dialog (e.g. from inventory link). */
  seedMedication?: Medication | null;
  addButtonClassName?: string;
  defaultQuantity?: string;
  /** Optional slot above search (e.g. nursing catalog tabs). */
  searchHeader?: ReactNode;
  filterMedication?: (medication: Medication) => boolean;
};

export function StockRequestItemsBuilder({
  items,
  onItemsChange,
  medicationCache,
  onMedicationLearned,
  seedMedication = null,
  addButtonClassName = "bg-blue-600 hover:bg-blue-700",
  defaultQuantity = "1",
  searchHeader,
  filterMedication,
}: StockRequestItemsBuilderProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [medicationSearch, setMedicationSearch] = useState("");
  const debouncedSearch = useDebouncedValue(medicationSearch, 300);
  const [searchResults, setSearchResults] = useState<Medication[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(seedMedication);
  const [requestQuantity, setRequestQuantity] = useState(defaultQuantity);

  useEffect(() => {
    setRequestQuantity(defaultQuantity);
  }, [defaultQuantity]);

  useEffect(() => {
    if (seedMedication) {
      setSelectedMedication(seedMedication);
    }
  }, [seedMedication]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setSearchLoading(true);
      try {
        const response = await pharmacyService.getMedications({
          search: term,
          page: 1,
          page_size: MEDICATION_SEARCH_LIMIT,
        });
        if (cancelled) return;
        const results = (response.results || []).filter((med) =>
          filterMedication ? filterMedication(med) : true,
        );
        setSearchResults(results);
        for (const med of results) {
          onMedicationLearned(med);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filterMedication]);

  const resetPicker = () => {
    setSelectedMedication(null);
    setRequestQuantity(defaultQuantity);
    setMedicationSearch("");
    searchRef.current?.focus();
  };

  const handleAddItem = () => {
    if (!selectedMedication) {
      toast.error("Select a medication first");
      return;
    }
    const packSize = selectedMedication.pack_size ?? 1;
    const inputVal = Number.parseInt(requestQuantity, 10);
    if (!Number.isFinite(inputVal) || inputVal < 1) {
      toast.error("Enter a valid quantity (min 1)");
      return;
    }
    const qty = requestInputToUnits(inputVal, packSize);
    if (qty > MAX_QUANTITY) {
      toast.error(`Quantity must not exceed ${MAX_QUANTITY.toLocaleString()} units`);
      return;
    }
    if (items.some((i) => i.medication === selectedMedication.id)) {
      toast.error("Already on the list — change quantity in the cart or remove it first");
      return;
    }
    onMedicationLearned(selectedMedication);
    onItemsChange([...items, { medication: selectedMedication.id, quantity: qty }]);
    toast.success(`Added ${selectedMedication.name}`);
    resetPicker();
  };

  const updateItemDisplayQty = (medicationId: number, displayQty: number) => {
    const med = medicationCache[medicationId];
    const packSize = med?.pack_size ?? 1;
    const units = requestInputToUnits(displayQty, packSize);
    onItemsChange(
      items.map((item) =>
        item.medication === medicationId ? { ...item, quantity: units } : item,
      ),
    );
  };

  const removeItem = (medicationId: number) => {
    onItemsChange(items.filter((item) => item.medication !== medicationId));
  };

  const packSize = selectedMedication?.pack_size ?? 1;
  const maxDisplay =
    packSize > 1 ? Math.floor(MAX_QUANTITY / packSize) : MAX_QUANTITY;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">
            {items.length === 0
              ? "Your request list"
              : `Your request (${items.length} drug${items.length === 1 ? "" : "s"})`}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Search below and add each drug. You can add as many as you need before submitting.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const med = medicationCache[item.medication];
              const itemPackSize = med?.pack_size ?? 1;
              const displayQty = toDisplayQuantity(item.quantity, itemPackSize);
              return (
                <div
                  key={item.medication}
                  className="flex items-center gap-2 rounded-lg border bg-background p-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{med?.name ?? "Medication"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPackDisplay(item.quantity, itemPackSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        updateItemDisplayQty(item.medication, Math.max(1, displayQty - 1))
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={
                        itemPackSize > 1
                          ? Math.floor(MAX_QUANTITY / itemPackSize)
                          : MAX_QUANTITY
                      }
                      value={displayQty}
                      onChange={(e) => {
                        const next = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(next) && next >= 1) {
                          updateItemDisplayQty(item.medication, next);
                        }
                      }}
                      className="w-14 h-8 text-center text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateItemDisplayQty(item.medication, displayQty + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.medication)}
                      title="Remove"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Add a drug</p>
        {searchHeader}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search by name or code, then pick from the list..."
            value={medicationSearch}
            onChange={(e) => setMedicationSearch(e.target.value)}
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectedMedication) {
                e.preventDefault();
                handleAddItem();
              }
            }}
          />
          {searchLoading && medicationSearch && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching...
            </p>
          )}
          {!searchLoading &&
            medicationSearch &&
            !selectedMedication &&
            searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No medications matched your search
                {filterMedication ? " in this catalog" : ""}.
              </p>
            )}
          {searchResults.length > 0 && medicationSearch && !selectedMedication && (
            <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-background shadow-lg z-10 max-h-48 overflow-y-auto">
              {searchResults.map((med) => {
                const alreadyAdded = items.some((i) => i.medication === med.id);
                return (
                  <button
                    key={med.id}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => {
                      setSelectedMedication(med);
                      setMedicationSearch("");
                      onMedicationLearned(med);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-medium">{med.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {med.code}
                      {med.strength ? ` · ${med.strength}` : ""}
                      {alreadyAdded ? " · Already on list" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedMedication && (
          <div className="rounded-lg bg-muted/40 border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{selectedMedication.name}</p>
                <p className="text-xs text-muted-foreground">{selectedMedication.code}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetPicker}>
                Change
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">
                  {packSize > 1
                    ? `Packs (×${packSize} units)`
                    : `Units (max ${MAX_QUANTITY.toLocaleString()})`}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={maxDisplay}
                  value={requestQuantity}
                  onChange={(e) => setRequestQuantity(e.target.value)}
                  className="mt-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                />
                {packSize > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {`${Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0).toLocaleString()} packs = ${(Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0) * packSize).toLocaleString()} units`}
                  </p>
                )}
              </div>
              <Button
                type="button"
                onClick={handleAddItem}
                className={`w-full sm:w-auto ${addButtonClassName}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add to list
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
