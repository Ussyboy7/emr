"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  referralService,
  type Referral,
  type ReferralFacility,
} from "@/lib/services/referral-service";

const CUSTOM_VALUE = "__custom__";

export interface FacilityPartnerSelectValue {
  /** id of a chosen catalog row, or null when the user typed a one-off name. */
  partnerId: number | null;
  /** Receiving facility name. Always required (snapshot copied to the Referral). */
  facility: string;
  facility_type: Referral["facility_type"];
}

interface Props {
  value: FacilityPartnerSelectValue;
  onChange: (next: FacilityPartnerSelectValue) => void;
  /** Show a Label above the field. Hide it when nesting under a custom Label. */
  showLabel?: boolean;
  className?: string;
  /** Disable interaction (e.g. while saving). */
  disabled?: boolean;
}

/**
 * Receiving-facility picker backed by the `ReferralFacility` catalog.
 *
 * - Lists active catalog rows from `/consultation/referral-facilities/`.
 * - Selecting a row autofills `facility` (name snapshot) and `facility_type`,
 *   and sets `partnerId` so the backend can copy the address snapshot on save.
 * - Picking "Other – type a custom name" reveals a free-text Input and clears
 *   `partnerId`, mirroring the lab dispatch "Other partner" flow.
 */
export function FacilityPartnerSelect({
  value,
  onChange,
  showLabel = true,
  className,
  disabled,
}: Props) {
  const [facilities, setFacilities] = useState<ReferralFacility[]>([]);
  const [loading, setLoading] = useState(false);
  const [customMode, setCustomMode] = useState<boolean>(value.partnerId == null && value.facility.length > 0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const rows = await referralService.getReferralFacilities({ is_active: true });
        if (!cancelled) setFacilities(rows);
      } catch {
        if (!cancelled) setFacilities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync customMode if the parent flips between partner-backed and free-typed
  // (e.g. when the parent resets the form for a new draft).
  useEffect(() => {
    if (value.partnerId != null) {
      if (customMode) setCustomMode(false);
    }
  }, [value.partnerId, customMode]);

  const selectValue = customMode
    ? CUSTOM_VALUE
    : value.partnerId != null
    ? String(value.partnerId)
    : "";

  const handlePick = (raw: string) => {
    if (raw === CUSTOM_VALUE) {
      setCustomMode(true);
      onChange({ partnerId: null, facility: "", facility_type: value.facility_type });
      return;
    }
    const id = Number(raw);
    const f = facilities.find((row) => row.id === id);
    if (!f) return;
    setCustomMode(false);
    onChange({
      partnerId: f.id,
      facility: f.name,
      facility_type: f.facility_type,
    });
  };

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {showLabel && <Label>Receiving facility</Label>}
      <Select value={selectValue} onValueChange={handlePick} disabled={disabled || loading}>
        <SelectTrigger>
          <SelectValue
            placeholder={
              loading ? "Loading facilities…" : "Choose facility from catalog"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {facilities.map((f) => (
            <SelectItem key={f.id} value={String(f.id)}>
              {f.name}
              {f.code ? ` (${f.code})` : ""}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Other – type a custom name…</SelectItem>
        </SelectContent>
      </Select>

      {customMode && (
        <Input
          value={value.facility}
          onChange={(e) =>
            onChange({
              partnerId: null,
              facility: e.target.value,
              facility_type: value.facility_type,
            })
          }
          placeholder="Receiving facility name"
          disabled={disabled}
          autoFocus
        />
      )}

      {loading && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading facility catalog…
        </div>
      )}
    </div>
  );
}
