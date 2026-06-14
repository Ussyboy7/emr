"use client";

const CATEGORY_KEYS = [
  "staff",
  "officers",
  "employee_dependants",
  "retirees",
  "retiree_dependents",
  "non_npa",
] as const;

const CATEGORY_HEADERS = [
  "Staff",
  "Officers",
  "Emp. Dep.",
  "Retiree",
  "Ret. Dep.",
  "Non NPA",
];

export interface AttendanceMatrixRow {
  gender: string;
  gender_label: string;
  staff: number;
  officers: number;
  employee_dependants: number;
  retirees: number;
  retiree_dependents: number;
  non_npa: number;
  row_total: number;
}

export interface AttendanceClinicBlock {
  key: string;
  label: string;
  rows: AttendanceMatrixRow[];
}

export interface AttendanceMatrixFooter {
  total_male?: AttendanceMatrixRow;
  total_female?: AttendanceMatrixRow;
  grand_total?: AttendanceMatrixRow;
}

export function AttendanceMatrixTable({
  clinics,
  footer,
  showFooter = true,
}: {
  clinics: AttendanceClinicBlock[];
  footer?: AttendanceMatrixFooter;
  showFooter?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-2 font-medium">Clinic / Gender</th>
            {CATEGORY_HEADERS.map((h) => (
              <th key={h} className="text-right p-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
            <th className="text-right p-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {clinics.map((block) =>
            block.rows.map((row) => {
              const isTotal = row.gender === "total";
              const label = isTotal
                ? `Total, ${block.label}`
                : `${block.label} (${row.gender_label})`;
              return (
                <tr
                  key={`${block.key}-${row.gender}`}
                  className={`border-b border-border ${isTotal ? "bg-muted/30 font-semibold" : "hover:bg-muted/20"}`}
                >
                  <td className="p-2 text-foreground">{label}</td>
                  {CATEGORY_KEYS.map((k) => (
                    <td key={k} className="p-2 text-right tabular-nums">
                      {row[k].toLocaleString()}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums font-medium">
                    {row.row_total.toLocaleString()}
                  </td>
                </tr>
              );
            })
          )}
          {showFooter && footer?.total_male ? (
            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
              <td className="p-2">{footer.total_male.gender_label}</td>
              {CATEGORY_KEYS.map((k) => (
                <td key={k} className="p-2 text-right tabular-nums">
                  {footer.total_male![k].toLocaleString()}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">
                {footer.total_male.row_total.toLocaleString()}
              </td>
            </tr>
          ) : null}
          {showFooter && footer?.total_female ? (
            <tr className="border-b border-border bg-muted/50 font-semibold">
              <td className="p-2">{footer.total_female.gender_label}</td>
              {CATEGORY_KEYS.map((k) => (
                <td key={k} className="p-2 text-right tabular-nums">
                  {footer.total_female![k].toLocaleString()}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">
                {footer.total_female.row_total.toLocaleString()}
              </td>
            </tr>
          ) : null}
          {showFooter && footer?.grand_total ? (
            <tr className="border-b border-border bg-muted/70 font-bold">
              <td className="p-2">{footer.grand_total.gender_label}</td>
              {CATEGORY_KEYS.map((k) => (
                <td key={k} className="p-2 text-right tabular-nums">
                  {footer.grand_total![k].toLocaleString()}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">
                {footer.grand_total.row_total.toLocaleString()}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
