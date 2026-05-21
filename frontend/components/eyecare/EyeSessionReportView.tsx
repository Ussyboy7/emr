'use client';

import type { EyeSession } from '@/lib/services/eye-care-service';
import {
  diagnosticAttachmentsForCategory,
  examinationRows,
  visualAcuityRows,
} from '@/lib/eyecare/eye-session-helpers';

type Props = {
  reportSession: EyeSession;
};

/**
 * Read-only SOAP-style eye session report (same content as Orders → Session Report).
 */
export function EyeSessionReportView({ reportSession }: Props) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Patient Information</h3>
            <div className="space-y-1">
              <p><span className="font-medium">Name:</span> {reportSession.order_details?.patient_name || reportSession.patient_name || 'N/A'}</p>
              <p><span className="font-medium">ID:</span> {reportSession.order_details?.patient_id || reportSession.patient_id || 'N/A'}</p>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
            <div className="space-y-1">
              <p><span className="font-medium">Session:</span> {reportSession.session_number ?? 'N/A'}</p>
              <p><span className="font-medium">Location:</span> {reportSession.order_details?.location_clinic_name || 'N/A'}</p>
              {reportSession.scheduled_at && (
                <p><span className="font-medium">Scheduled:</span> {new Date(reportSession.scheduled_at).toLocaleString()}</p>
              )}
              {reportSession.completed_at && (
                <p><span className="font-medium">Completed:</span> {new Date(reportSession.completed_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
        {reportSession.order_details?.diagnosis && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Diagnosis</p>
            <p className="text-sm mt-1">{reportSession.order_details.diagnosis}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 border-b pb-2">SUBJECTIVE (S)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">CC:</span> {reportSession.soap_note?.subjective?.chiefComplaint || reportSession.order_details?.chief_complaint || 'Not documented'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">POHx:</span> {reportSession.soap_note?.subjective?.ocularHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">PMHx:</span> {reportSession.soap_note?.subjective?.medicalHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Drug History:</span> {reportSession.soap_note?.subjective?.drugHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Allergies:</span> {reportSession.soap_note?.subjective?.allergyHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Social History:</span> {reportSession.soap_note?.subjective?.socialHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">FOHx:</span> {reportSession.soap_note?.subjective?.familyOcularHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">FMHx:</span> {reportSession.soap_note?.subjective?.familyMedicalHistory || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Special Instructions:</span> {reportSession.order_details?.special_instructions || '—'}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 border-b pb-2">OBJECTIVE (O)</h3>
        <div className="space-y-4 text-sm">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Visual Acuity</th>
                  <th className="p-2 text-left">OD</th>
                  <th className="p-2 text-left">OS</th>
                  <th className="p-2 text-left">OU</th>
                </tr>
              </thead>
              <tbody>
                {visualAcuityRows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2">{reportSession.soap_note?.objective?.visualAcuity?.[row.key]?.od || (row.key === 'distanceUnaided' ? reportSession.order_details?.visual_acuity_od : '') || '—'}</td>
                    <td className="p-2">{reportSession.soap_note?.objective?.visualAcuity?.[row.key]?.os || (row.key === 'distanceUnaided' ? reportSession.order_details?.visual_acuity_os : '') || '—'}</td>
                    <td className="p-2">{reportSession.soap_note?.objective?.visualAcuity?.[row.key]?.ou || (row.key === 'distanceUnaided' ? reportSession.order_details?.visual_acuity_ou : '') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Structure</th>
                  <th className="p-2 text-left">OD</th>
                  <th className="p-2 text-left">OS</th>
                </tr>
              </thead>
              <tbody>
                {examinationRows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2">{reportSession.soap_note?.objective?.examination?.[row.key]?.od || '—'}</td>
                    <td className="p-2">{reportSession.soap_note?.objective?.examination?.[row.key]?.os || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <p className="bg-muted/50 p-3 rounded border">
              <span className="font-medium">IOP:</span> OD {reportSession.soap_note?.objective?.diagnostics?.iopOd || reportSession.order_details?.iop_od || '—'} | OS {reportSession.soap_note?.objective?.diagnostics?.iopOs || reportSession.order_details?.iop_os || '—'}<br />
              <span className="font-medium">Method:</span> {reportSession.soap_note?.objective?.diagnostics?.method || '—'} | <span className="font-medium">Time:</span> {reportSession.soap_note?.objective?.diagnostics?.time || '—'}
            </p>
            <div className="bg-muted/50 p-3 rounded border space-y-2">
              {([
                ['pachymetry', 'Pachymetry', reportSession.soap_note?.objective?.diagnostics?.pachymetry],
                ['oct', 'OCT', reportSession.soap_note?.objective?.diagnostics?.oct],
                ['visual_field', 'Visual Field', reportSession.soap_note?.objective?.diagnostics?.visualField],
              ] as const).map(([cat, title, noteText]) => {
                const items = diagnosticAttachmentsForCategory(reportSession, cat);
                return (
                  <p key={cat}>
                    <span className="font-medium">{title}:</span> {noteText || '—'}{' '}
                    {items.map((a, idx) => (
                      <span key={a.id != null ? `id-${a.id}` : `u-${idx}`} className="inline-block mr-2">
                        <a
                          href={a.file}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {items.length > 1 ? `View file ${idx + 1}` : 'View file'}
                        </a>
                      </span>
                    ))}
                  </p>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Refraction</th>
                  <th className="p-2 text-left">Eye</th>
                  <th className="p-2 text-left">Sphere</th>
                  <th className="p-2 text-left">Cylinder</th>
                  <th className="p-2 text-left">Axis</th>
                  <th className="p-2 text-left">VA</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['lensometry', 'Lensometry'],
                  ['autorefraction', 'Autorefraction'],
                  ['retinoscopy', 'Retinoscopy'],
                  ['subjective', 'Subjective'],
                ].flatMap(([group, label]) => (['od', 'os'] as const).map((eye) => (
                  <tr key={`${group}-${eye}`} className="border-t">
                    <td className="p-2 font-medium">{label}</td>
                    <td className="p-2 uppercase">{eye}</td>
                    <td className="p-2">{(reportSession.soap_note?.objective?.refraction as any)?.[group]?.[eye]?.sphere || (group === 'subjective' && eye === 'od' ? reportSession.order_details?.refraction_od : '') || (group === 'subjective' && eye === 'os' ? reportSession.order_details?.refraction_os : '') || '—'}</td>
                    <td className="p-2">{(reportSession.soap_note?.objective?.refraction as any)?.[group]?.[eye]?.cylinder || '—'}</td>
                    <td className="p-2">{(reportSession.soap_note?.objective?.refraction as any)?.[group]?.[eye]?.axis || '—'}</td>
                    <td className="p-2">{(reportSession.soap_note?.objective?.refraction as any)?.[group]?.[eye]?.va || '—'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <div className="bg-muted/50 p-3 rounded border grid grid-cols-2 gap-3 text-sm">
            <p><span className="font-medium">Near Addition (ADD):</span> {(reportSession.soap_note?.objective?.refraction as any)?.nearAddition?.add || '—'}</p>
            <p><span className="font-medium">Near VA:</span> {(reportSession.soap_note?.objective?.refraction as any)?.nearAddition?.va || '—'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 border-b pb-2">ASSESSMENT (A)</h3>
        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{reportSession.soap_note?.assessment?.diagnosis || reportSession.order_details?.diagnosis || reportSession.findings || 'Not documented'}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 border-b pb-2">PLAN (P)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Optical Correction:</span> {reportSession.soap_note?.plan?.opticalCorrection || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Medications:</span> {reportSession.soap_note?.plan?.medications || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Management Plan:</span> {reportSession.soap_note?.plan?.managementPlan || reportSession.order_details?.treatment_plan || reportSession.procedures_performed || '—'}</p>
          <p className="bg-muted/50 p-3 rounded border"><span className="font-medium">Follow-up Date:</span> {reportSession.soap_note?.plan?.followUpDate || '—'}</p>
        </div>
      </div>
    </div>
  );
}
