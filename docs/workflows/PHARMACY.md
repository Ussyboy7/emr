# Medication multiple strengths & topical dispensing

## Drug Master and Generics sync

- **Drug Master** = **Medications** (brands). Each medication has `generic_id` → **GenericMedication**.
- **Category** and **unit** live on both:
  - **Medication:** `category`, `unit` (used for prescribing/dispensing).
  - **GenericMedication:** `category`, `unit` (default unit per dose; used when adding a new brand so the form can prefill unit from the generic).
- When you **add a medication** in Drug Master and select a generic, the **unit** field is prefilled from the generic’s unit when available. Category is set per brand (and in seed data comes from CSV or generic).
- Seed data (e.g. `seed_demo_data`, BRAND_MEDICATIONS_SEED.csv) sets **category** and **unit** for brands; generic seed sets **category** and **unit** (unit inferred from dosage form) for generics.

---

## 1. Database check – what’s actually in the DB

Use the management command (with Docker):

```bash
docker exec emr-backend-local python manage.py list_medication_strengths
docker exec emr-backend-local python manage.py list_medication_strengths --search "Amlodipine"
docker exec emr-backend-local python manage.py list_medication_strengths --dupes-only
```

### Findings (confirmed)

- **Amlodipine/Valsartan/Hydrochlorothiazide**
  - **Brand (Medication):** Only **1** brand: Exforge HCT 10/160/12.5mg. So no “multiple strengths” at brand level for this combination.
  - **Generic (GenericMedication):** **2** rows for the same strength with different formatting:
    - `10/160/12.5mg`
    - `10mg/160mg/12.5mg`
  So the same strength exists twice at generic level (only string format differs). That can cause duplicate or confusing behaviour anywhere that lists by generic.

- **Other combos (e.g. Amlodipine/Valsartan, Perindopril/Amlodipine):** Same pattern: multiple generic variants with the same strength in different formats (e.g. `10/320mg` vs `10mg/160mg`).

- **Single-ingredient drugs (e.g. Amlodipine, Diclofenac):** Multiple strengths (5mg vs 10mg, 50mg vs 75mg vs 100mg) are **correct** – one product per strength, sometimes multiple brands per strength.

So: “multiple strengths” in the UI can come from  
(1) **duplicate generic variants** (same strength, different string), and/or  
(2) **intentional** multiple strengths (e.g. Diclofenac 50mg, 75mg, 100mg) which should stay.

---

## 2. Should we “separate them all”?

- **Do not** split **combination drugs** (e.g. Amlodipine/Valsartan/HCTZ) into separate ingredients for prescribing. They are single products; splitting would break prescribing and dispensing.
- **Do** keep **one product per strength** (and per form where relevant): e.g. one row for “10/160/12.5mg Tablet”, another for “5/160/12.5mg Tablet” if you add that strength.
- **Do** clean up **duplicate generics**: same name + same strength (after normalizing format) should be a single generic. Merge duplicates and point all brands to the single generic.

So: “separate” = one row per strength (and form), no duplicate generics; **not** splitting combinations into separate ingredients.

---

## 3. Creams / ointments – dispense per pack (like syrup)

- Creams, ointments, gels, lotions **cannot** be dispensed “per use” (like tablets). They are dispensed **per pack** (tube, bottle, jar).
- The codebase already treats them similarly to syrup:
  - **unit:** e.g. `Tube`, `Bottle`, `Jar` (not “application”).
  - **pack_size:** typically **1** (1 tube = 1 pack) – see `set_pack_size_defaults` (cream/ointment/gel/lotion → 1).
  - **Quantity on prescription:** number of **tubes/packs** (e.g. “2 tubes”), not “per use”.
- So: **same idea as syrup** (bottle = 1 pack, quantity = number of bottles). For topicals, **1 pack = 1 tube** (or 1 bottle/jar), and we dispense by **number of tubes**, not by “uses” or “applications”.

No change needed to the conceptual model; ensure:
- All topical products have `unit` = Tube (or Bottle/Jar) and `pack_size` = 1.
- Prescription and dispensing UIs show quantity as “tubes” (or “packs”) and pharmacy dispenses whole tubes.

---

## 4. Recommended next steps

1. **Merge duplicate generics**  
   Same generic name + same strength (after normalizing, e.g. `10/160/12.5mg` and `10mg/160mg/12.5mg` → one canonical form). Keep one GenericMedication per (name, strength, form) and reassign any brands from the duplicate generic to the kept one, then remove duplicates.

2. **Keep one brand per strength**  
   No change to the “one Medication per strength (and form)” design; only remove duplicate **generic** rows.

3. **Creams/ointments**  
   Keep current approach: dispense per pack (1 tube = 1 pack), quantity = number of tubes, same pattern as syrup. Ensure seed/import sets `unit` and `pack_size` for topicals (already done in `set_pack_size_defaults` and import logic for cream/ointment/gel/lotion).

**Done.** The management command **merge_duplicate_generics** finds and merges duplicate generics (same name + normalized strength + form). Run dry run first, then with `--commit`:

```bash
python manage.py merge_duplicate_generics              # dry run
python manage.py merge_duplicate_generics --commit     # apply
# Docker:
docker exec emr-backend-local python manage.py merge_duplicate_generics --commit
```

---

## 5. HOD Store (Head of Pharmacy)

The **HOD Store** is a separate inventory pool at **Bode Thomas Clinic** (`location = "HOD Store"`). It uses the same drug master as Central Store and Dispensary, but stock quantities are tracked independently.

### Who can access

| Role | Access |
|------|--------|
| **Primary Head of Pharmacy** at Bode Thomas | Full HOD Store UI (inventory, issue, requests, history) |
| **Deputy Head of Pharmacy** | No HOD Store access |
| **Super admin** | Full access (support) |
| **Central Store operators** | Store Requests → HOD Store tab only (issue to HOD / request from HOD) |

Sidebar visibility uses `is_pharmacy_hod` on the user profile, or the **Pharmacy Head** role pages (`/pharmacy/hod-store`, `/pharmacy/hod-store/requests`, `/pharmacy/hod-store/history`).

### Inventory pools (Bode Thomas)

| Pool | Location | Used for |
|------|----------|----------|
| Central Store | `Store` | Warehouse; issues to Dispensary, Ward Care, and HOD Store |
| Dispensary | `Dispensary` | Prescription dispensing queue |
| HOD Store | `HOD Store` | Discretionary issues by Pharmacy Head (not Rx queue) |

### HOD → Central Store and Central → HOD transfers

Stock moves between Central Store and HOD Store use the standard **StockRequest** workflow (`fulfill` / confirm receipt).

**Central Store → HOD Store** (restock HOD)

1. **HOD:** HOD Requests → **Orders to HOD store** → **Order from Central Store**
2. **Central:** Store Requests → HOD Store → **To HOD store** → approve → **Issue to HOD Store**
3. **HOD:** HOD Requests → open request → **Confirm receipt** when stock arrives

**HOD Store → Central Store** (return stock to warehouse)

1. **Central:** Store Requests → HOD Store → **From HOD store** → **Request from HOD Store**
2. **Central:** approve → **Issue from HOD Store** (deducts HOD inventory, adds to Store)
3. Confirm receipt per local policy if the request status requires it

### Discretionary HOD issuing (no prescription)

HOD issues are **not** prescription dispenses. They are recorded as **HodStockIssue** (separate from `Dispense`).

1. **HOD:** HOD Store → **Issue** tab
2. Search medication, enter quantity (optional patient name/MRN, reason, notes)
3. Stock is deducted from `HOD Store` using FIFO (or a selected batch)
4. History appears under **HOD Dispense History**

### Analytics

Pharmacy Analytics includes an **HOD Store** section: issue events, total quantity, daily trend, and top medications. HOD metrics are separate from prescription dispensing counts.

### Related paths

| Task | UI path |
|------|---------|
| HOD inventory | `/pharmacy/hod-store` (Inventory tab) |
| HOD issue (no Rx) | `/pharmacy/hod-store` (Issue tab) |
| Order from Central | `/pharmacy/hod-store/requests` → Orders to HOD store |
| Confirm HOD receipt | `/pharmacy/hod-store/requests` → request details |
| HOD issue audit trail | `/pharmacy/hod-store/history` |
| Central issue to HOD | `/pharmacy/store/requests` → HOD Store → To HOD store |
| Central request from HOD | `/pharmacy/store/requests` → HOD Store → From HOD store |

User-facing summary: [ROLE_PHARMACY.md](../user/ROLE_PHARMACY.md).

