'use client';

import { Eye, FileText, Stethoscope, ClipboardList } from 'lucide-react';
import type { EyeSession } from '@/lib/services/eye-care-service';
import {
  diagnosticAttachmentsForCategory,
  examinationRows,
  visualAcuityRows,
} from '@/lib/eyecare/eye-session-helpers';
import { getOrganizationServicesHeader } from '@/lib/constants/organization';

type Props = {
  reportSession: EyeSession;
};

function NoteField({ label, value }: { label: string; value: string }) {
  if (!value || value === '—') return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

/**
 * Clinical body of the eye session report (SOAP). Shell/header lives in EyeSessionReportDialog.
 */
export function EyeSessionReportView({ reportSession }: Props) {
  const subjective = reportSession.soap_note?.subjective;
  const objective = reportSession.soap_note?.objective;
  const assessment = reportSession.soap_note?.assessment?.diagnosis || '';
  const plan = reportSession.soap_note?.plan;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <FileText className="h-4 w-4" />
          SUBJECTIVE
        </h3>
        <NoteField label="Chief Complaint" value={subjective?.chiefComplaint || ''} />
        <NoteField label="Past Ocular History" value={subjective?.ocularHistory || ''} />
        <NoteField label="Past Medical History" value={subjective?.medicalHistory || ''} />
        <NoteField label="Drug History" value={subjective?.drugHistory || ''} />
        <NoteField label="Allergies" value={subjective?.allergyHistory || ''} />
        <NoteField label="Social History" value={subjective?.socialHistory || ''} />
        <NoteField label="Family Ocular History" value={subjective?.familyOcularHistory || ''} />
        <NoteField label="Family Medical History" value={subjective?.familyMedicalHistory || ''} />
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
          <Eye className="h-4 w-4" />
          OBJECTIVE
        </h3>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Visual Acuity</p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50 dark:bg-cyan-950/30">
                <tr>
                  <th className="text-left p-3 font-medium">Test</th>
                  <th className="text-left p-3 font-medium">OD</th>
                  <th className="text-left p-3 font-medium">OS</th>
                  <th className="text-left p-3 font-medium">OU</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visualAcuityRows.map((row) => (
                  <tr key={row.key}>
                    <td className="p-3 font-medium">{row.label}</td>
                    <td className="p-3">{objective?.visualAcuity?.[row.key]?.od || '—'}</td>
                    <td className="p-3">{objective?.visualAcuity?.[row.key]?.os || '—'}</td>
                    <td className="p-3">{objective?.visualAcuity?.[row.key]?.ou || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Ocular Examination</p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50 dark:bg-cyan-950/30">
                <tr>
                  <th className="text-left p-3 font-medium">Structure</th>
                  <th className="text-left p-3 font-medium">OD</th>
                  <th className="text-left p-3 font-medium">OS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {examinationRows.map((row) => (
                  <tr key={row.key}>
                    <td className="p-3 font-medium">{row.label}</td>
                    <td className="p-3">{objective?.examination?.[row.key]?.od || '—'}</td>
                    <td className="p-3">{objective?.examination?.[row.key]?.os || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Intraocular Pressure</p>
            <p className="p-3 bg-muted/50 rounded-lg text-sm">
              OD {objective?.diagnostics?.iopOd || '—'} | OS {objective?.diagnostics?.iopOs || '—'}
              <br />
              Method: {objective?.diagnostics?.method || '—'} | Time:{' '}
              {objective?.diagnostics?.time || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Diagnostics</p>
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              {(
                [
                  ['pachymetry', 'Pachymetry', objective?.diagnostics?.pachymetry],
                  ['oct', 'OCT', objective?.diagnostics?.oct],
                  ['visual_field', 'Visual Field', objective?.diagnostics?.visualField],
                ] as const
              ).map(([cat, title, noteText]) => {
                const items = diagnosticAttachmentsForCategory(reportSession, cat);
                return (
                  <p key={cat}>
                    <span className="font-medium">{title}:</span> {noteText || '—'}{' '}
                    {items.map((a, idx) => (
                      <a
                        key={a.id != null ? `id-${a.id}` : `u-${idx}`}
                        href={a.file}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline mr-2"
                      >
                        {items.length > 1 ? `File ${idx + 1}` : 'View file'}
                      </a>
                    ))}
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Refraction</p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50 dark:bg-cyan-950/30">
                <tr>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Eye</th>
                  <th className="text-left p-3 font-medium">Sphere</th>
                  <th className="text-left p-3 font-medium">Cylinder</th>
                  <th className="text-left p-3 font-medium">Axis</th>
                  <th className="text-left p-3 font-medium">VA</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(
                  [
                    ['lensometry', 'Lensometry'],
                    ['autorefraction', 'Autorefraction'],
                    ['retinoscopy', 'Retinoscopy'],
                    ['subjective', 'Subjective'],
                  ] as const
                ).flatMap(([group, label]) =>
                  (['od', 'os'] as const).map((eye) => (
                    <tr key={`${group}-${eye}`}>
                      <td className="p-3 font-medium">{label}</td>
                      <td className="p-3 uppercase">{eye}</td>
                      <td className="p-3">
                        {(objective?.refraction as any)?.[group]?.[eye]?.sphere || '—'}
                      </td>
                      <td className="p-3">
                        {(objective?.refraction as any)?.[group]?.[eye]?.cylinder || '—'}
                      </td>
                      <td className="p-3">{(objective?.refraction as any)?.[group]?.[eye]?.axis || '—'}</td>
                      <td className="p-3">{(objective?.refraction as any)?.[group]?.[eye]?.va || '—'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NoteField
            label="Near Addition (ADD)"
            value={(objective?.refraction as any)?.nearAddition?.add || ''}
          />
          <NoteField label="Near VA" value={(objective?.refraction as any)?.nearAddition?.va || ''} />
        </div>
      </div>

      {assessment ? (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
            <Stethoscope className="h-4 w-4" />
            ASSESSMENT
          </h3>
          <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800 whitespace-pre-wrap">
            {assessment}
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <ClipboardList className="h-4 w-4" />
          PLAN
        </h3>
        <NoteField label="Optical Correction" value={plan?.opticalCorrection || ''} />
        <NoteField label="Medications" value={plan?.medications || ''} />
        <NoteField label="Management Plan" value={plan?.managementPlan || ''} />
        <NoteField label="Follow-up Date" value={plan?.followUpDate || ''} />
      </div>

      <div className="border-t pt-4 text-xs text-muted-foreground text-center">
        {getOrganizationServicesHeader()}
      </div>
    </div>
  );
}
