'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import {
  PATIENT_TITLE_OPTIONS,
  MARITAL_STATUSES,
  RELIGIONS,
  NIGERIAN_TRIBES,
  NOK_RELATIONSHIPS,
  NPA_DIVISIONS,
  NON_NPA_TYPES,
  DEPENDENT_TYPES,
  EMPLOYEE_TYPES,
  NIGERIA_STATES_AND_LGAS,
} from '@/lib/constants/patient';
import {
  Edit,
  X,
  Loader2,
  AlertTriangle,
  Camera,
  Upload,
  Trash2,
  Plus,
  User,
  Briefcase,
  Phone,
  Heart,
} from 'lucide-react';

export type EditPatientFormState = {
  personalNumber: string;
  title: string;
  gender: 'male' | 'female';
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  maritalStatus: string;
  religion: string;
  tribe: string;
  occupation: string;
  phone: string;
  email: string;
  residentialAddress: string;
  permanentAddress: string;
  stateOfResidence: string;
  stateOfOrigin: string;
  lga: string;
  bloodGroup: string;
  genotype: string;
  location: string;
  division: string;
  employeeType: string;
  nonnpaType: string;
  dependentType: string;
  nokSurname: string;
  nokFirstName: string;
  nokMiddleName: string;
  nokRelationship: string;
  nokPhone: string;
  nokAddress: string;
};

export type EditMedicalHistoryState = {
  allergies: string[];
  diagnoses: Array<{
    code?: string;
    name: string;
    status: string;
    diagnosedDate?: string;
    treatingDoctor?: string;
  }>;
  surgicalHistory: Array<{ procedure: string; date: string; hospital: string }>;
  familyHistory: Array<{ relation: string; condition: string }>;
  socialHistory: {
    smoking: string;
    alcohol: string;
    exercise: string;
    occupation: string;
  };
};

type PatientLike = {
  id: string;
  name: string;
  category: string;
};

type LocationOption = { value: string; label: string };

type EditTab = 'personal' | 'work' | 'contact' | 'medical';

const STEPS: { id: EditTab; label: string; icon: React.ReactNode }[] = [
  { id: 'personal', label: 'Personal', icon: <User className="h-4 w-4" /> },
  { id: 'work', label: 'Work Info', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'contact', label: 'Contact', icon: <Phone className="h-4 w-4" /> },
  { id: 'medical', label: 'Medical & NOK', icon: <Heart className="h-4 w-4" /> },
];

function ageFromDob(dob: string): string {
  if (!dob) return '';
  const today = new Date();
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return '';

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return `${months} month${months === 1 ? '' : 's'}`;
  if (months <= 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPatient: PatientLike | null;
  editForm: EditPatientFormState;
  setEditForm: Dispatch<SetStateAction<EditPatientFormState>>;
  editFormLoading: boolean;
  medicalHistory: EditMedicalHistoryState;
  setMedicalHistory: Dispatch<SetStateAction<EditMedicalHistoryState>>;
  editPrincipalInfo: { personalNumber: string; fullName: string } | null;
  photoPreview: string | null;
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  canEditPersonalNumberField: boolean;
  locationOptions: LocationOption[];
  isSubmitting: boolean;
  onSave: () => void;
};

export function EditPatientDialog({
  open,
  onOpenChange,
  selectedPatient,
  editForm,
  setEditForm,
  editFormLoading,
  medicalHistory,
  setMedicalHistory,
  editPrincipalInfo,
  photoPreview,
  onPhotoSelect,
  onRemovePhoto,
  canEditPersonalNumberField,
  locationOptions,
  isSubmitting,
  onSave,
}: Props) {
  const [tab, setTab] = useState<EditTab>('personal');
  const [allergyDraft, setAllergyDraft] = useState('');

  const calculateAge = useMemo(() => ageFromDob(editForm.dateOfBirth), [editForm.dateOfBirth]);
  const availableLGAs =
    NIGERIA_STATES_AND_LGAS.find((s) => s.name === editForm.stateOfOrigin)?.lgas || [];

  const patch = (partial: Partial<EditPatientFormState>) =>
    setEditForm((prev) => ({ ...prev, ...partial }));

  const addAllergy = () => {
    const value = allergyDraft.trim();
    if (!value) return;
    setMedicalHistory((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(value) ? prev.allergies : [...prev.allergies, value],
    }));
    setAllergyDraft('');
  };

  const category = selectedPatient?.category ?? '';
  const isEmployee = category === 'Employee';
  const isRetiree = category === 'Retiree';
  const isDependent = category === 'Dependent';
  const isNonNpa = category === 'NonNPA';
  const showPersonalNumber = isEmployee || isRetiree;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setTab('personal');
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0 space-y-1">
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-500" />
            Edit Patient
          </DialogTitle>
          <DialogDescription>
            Update registration details using the same sections as Register Patient.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0" key={selectedPatient?.id ?? 'edit'}>
          {editFormLoading || !selectedPatient ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading patient data...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Patient ID (Cannot be changed)</p>
                  <p className="font-medium">{selectedPatient.id}</p>
                </div>
                <Badge variant="outline">{selectedPatient.category}</Badge>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)}>
                <TabsList className="grid w-full grid-cols-4 h-9">
                  {STEPS.map((step) => (
                    <TabsTrigger key={step.id} value={step.id} className="gap-1.5 text-xs">
                      {step.icon}
                      <span className="hidden sm:inline">{step.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="personal" className="space-y-4 pt-4">
                  {showPersonalNumber && (
                    <div className="space-y-2">
                      <Label>Personal Number *</Label>
                      <Input
                        value={editForm.personalNumber}
                        onChange={(e) => patch({ personalNumber: e.target.value })}
                        readOnly={!canEditPersonalNumberField}
                        className={!canEditPersonalNumberField ? 'bg-muted' : undefined}
                        placeholder="e.g. A2962 (NPA personal number)"
                      />
                      {canEditPersonalNumberField ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Changing personal number updates the principal patient ID and re-syncs linked
                          dependent IDs (ED-/RD-).
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Only system administrators can change personal number.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Patient Photo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                        {photoPreview ? (
                          photoPreview.startsWith('data:') ? (
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <PatientAvatar
                              name={selectedPatient.name}
                              photoUrl={photoPreview}
                              size="lg"
                              className="w-full h-full rounded-lg"
                            />
                          )
                        ) : (
                          <Camera className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="edit-photo-upload"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            onChange={onPhotoSelect}
                            className="hidden"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => document.getElementById('edit-photo-upload')?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {photoPreview ? 'Change Photo' : 'Upload Photo'}
                          </Button>
                          {photoPreview && (
                            <Button variant="outline" size="sm" type="button" onClick={onRemovePhoto}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">JPG, PNG, or WebP. Max 5MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Select
                        value={editForm.title || undefined}
                        onValueChange={(v) => patch({ title: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select title" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {PATIENT_TITLE_OPTIONS.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Gender *</Label>
                      <Select
                        value={editForm.gender}
                        onValueChange={(v) => patch({ gender: v as 'male' | 'female' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input
                      value={editForm.lastName}
                      onChange={(e) => patch({ lastName: e.target.value })}
                      placeholder="Surname"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>First Name *</Label>
                      <Input
                        value={editForm.firstName}
                        onChange={(e) => patch({ firstName: e.target.value })}
                        placeholder="First name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Middle Name</Label>
                      <Input
                        value={editForm.middleName}
                        onChange={(e) => patch({ middleName: e.target.value })}
                        placeholder="Middle name"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Date of Birth *</Label>
                      <Input
                        type="date"
                        value={editForm.dateOfBirth}
                        onChange={(e) => patch({ dateOfBirth: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Age</Label>
                      <Input
                        value={calculateAge}
                        readOnly
                        placeholder="Auto-calculated"
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Marital Status</Label>
                      <Select
                        value={editForm.maritalStatus || undefined}
                        onValueChange={(v) =>
                          patch({ maritalStatus: v === 'not-specified' ? '' : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {MARITAL_STATUSES.map((status) => (
                            <SelectItem key={status} value={status.toLowerCase()}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Religion</Label>
                      <Select
                        value={editForm.religion || undefined}
                        onValueChange={(v) => patch({ religion: v === 'not-specified' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select religion" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {RELIGIONS.map((religion) => (
                            <SelectItem key={religion} value={religion}>
                              {religion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tribe</Label>
                      <Select
                        value={editForm.tribe || undefined}
                        onValueChange={(v) => patch({ tribe: v === 'not-specified' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select tribe" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {NIGERIAN_TRIBES.map((tribe) => (
                            <SelectItem key={tribe} value={tribe}>
                              {tribe}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Occupation</Label>
                      <Input
                        value={editForm.occupation}
                        onChange={(e) => patch({ occupation: e.target.value })}
                        placeholder="e.g. Senior Engineer - NPA"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="work" className="space-y-4 pt-4">
                  {isEmployee && (
                    <>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={editForm.employeeType || undefined}
                          onValueChange={(v) =>
                            patch({ employeeType: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {EMPLOYEE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Division</Label>
                        <Select
                          value={editForm.division || undefined}
                          onValueChange={(v) =>
                            patch({ division: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select division" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[250px]">
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {NPA_DIVISIONS.map((div) => (
                              <SelectItem key={div} value={div}>
                                {div}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Select
                          value={editForm.location || undefined}
                          onValueChange={(v) =>
                            patch({ location: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {locationOptions
                              .filter((l) => l.value !== 'all')
                              .map((l) => (
                                <SelectItem key={l.value} value={l.value}>
                                  {l.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {isRetiree && (
                    <div className="p-4 rounded-lg bg-muted/50 border border-muted">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Retiree Status:</span> Work-related
                        fields (Type, Division, Location) are not required for retirees.
                      </p>
                    </div>
                  )}

                  {isNonNpa && (
                    <>
                      <div className="space-y-2">
                        <Label>Non-NPA Type</Label>
                        <Select
                          value={editForm.nonnpaType || undefined}
                          onValueChange={(v) =>
                            patch({ nonnpaType: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {NON_NPA_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Select
                          value={editForm.location || undefined}
                          onValueChange={(v) =>
                            patch({ location: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {locationOptions
                              .filter((l) => l.value !== 'all')
                              .map((l) => (
                                <SelectItem key={l.value} value={l.value}>
                                  {l.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {isDependent && (
                    <>
                      <div className="space-y-2">
                        <Label>Dependent Type</Label>
                        <Select
                          value={editForm.dependentType || undefined}
                          onValueChange={(v) =>
                            patch({ dependentType: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {DEPENDENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Principal personal number</Label>
                        <Input
                          value={editPrincipalInfo?.personalNumber || ''}
                          readOnly
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">
                          {editPrincipalInfo?.fullName
                            ? `Linked to ${editPrincipalInfo.fullName}. Changing the principal link is not supported here—register a new dependent under the correct principal if needed.`
                            : 'Principal record not loaded or not linked.'}
                        </p>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="contact" className="space-y-4 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => patch({ email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone *</Label>
                      <Input
                        value={editForm.phone}
                        onChange={(e) => patch({ phone: e.target.value })}
                        placeholder="e.g., 08012345678"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>State of Residence</Label>
                      <Select
                        value={editForm.stateOfResidence || undefined}
                        onValueChange={(v) =>
                          patch({ stateOfResidence: v === 'not-specified' ? '' : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {NIGERIA_STATES_AND_LGAS.map((s) => (
                            <SelectItem key={s.name} value={s.name}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Residential Address</Label>
                      <Textarea
                        value={editForm.residentialAddress}
                        onChange={(e) => patch({ residentialAddress: e.target.value })}
                        placeholder="Current residential address"
                        rows={2}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>State of Origin</Label>
                      <Select
                        value={editForm.stateOfOrigin || undefined}
                        onValueChange={(v) => {
                          const next = v === 'not-specified' ? '' : v;
                          patch({ stateOfOrigin: next, lga: '' });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {NIGERIA_STATES_AND_LGAS.map((s) => (
                            <SelectItem key={s.name} value={s.name}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Local Government Area</Label>
                      <Select
                        value={editForm.lga || undefined}
                        onValueChange={(v) => patch({ lga: v === 'not-specified' ? '' : v })}
                        disabled={!editForm.stateOfOrigin || availableLGAs.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              editForm.stateOfOrigin ? 'Select LGA' : 'Select state of origin first'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          <SelectItem value="not-specified">Unspecified</SelectItem>
                          {availableLGAs.map((lga) => (
                            <SelectItem key={lga} value={lga}>
                              {lga}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Permanent Address</Label>
                    <Textarea
                      value={editForm.permanentAddress}
                      onChange={(e) => patch({ permanentAddress: e.target.value })}
                      placeholder="Permanent home address"
                      rows={2}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="medical" className="space-y-6 pt-4">
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Heart className="h-4 w-4 text-rose-500" />
                      Medical Details
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Blood Group</Label>
                        <Select
                          value={editForm.bloodGroup || undefined}
                          onValueChange={(v) =>
                            patch({ bloodGroup: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                              <SelectItem key={bg} value={bg}>
                                {bg}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Genotype</Label>
                        <Select
                          value={editForm.genotype || undefined}
                          onValueChange={(v) =>
                            patch({ genotype: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {['AA', 'AS', 'SS', 'AC', 'SC'].map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Allergies</Label>
                    <div className="flex gap-2">
                      <Input
                        value={allergyDraft}
                        onChange={(e) => setAllergyDraft(e.target.value)}
                        placeholder="e.g. Penicillin"
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addAllergy();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addAllergy}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {medicalHistory.allergies.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No allergies recorded</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {medicalHistory.allergies.map((allergy, index) => (
                          <Badge key={index} className="bg-red-600 text-white hover:bg-red-700 pr-1">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {allergy}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setMedicalHistory((prev) => ({
                                  ...prev,
                                  allergies: prev.allergies.filter((_, i) => i !== index),
                                }))
                              }
                              className="h-4 w-4 p-0 ml-1 hover:bg-red-800"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Chronic Conditions</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setMedicalHistory((prev) => ({
                            ...prev,
                            diagnoses: [
                              ...prev.diagnoses,
                              { name: '', code: '', status: 'Active', diagnosedDate: '' },
                            ],
                          }))
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Condition
                      </Button>
                    </div>
                    {medicalHistory.diagnoses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No chronic conditions recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {medicalHistory.diagnoses.map((diagnosis, index) => (
                          <div key={index} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Condition #{index + 1}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setMedicalHistory((prev) => ({
                                    ...prev,
                                    diagnoses: prev.diagnoses.filter((_, i) => i !== index),
                                  }))
                                }
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">ICD-10 Code</Label>
                                <Input
                                  value={diagnosis.code || ''}
                                  onChange={(e) => {
                                    const updated = [...medicalHistory.diagnoses];
                                    updated[index] = { ...updated[index], code: e.target.value };
                                    setMedicalHistory((prev) => ({ ...prev, diagnoses: updated }));
                                  }}
                                  placeholder="e.g., I10"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                <Select
                                  value={diagnosis.status}
                                  onValueChange={(value) => {
                                    const updated = [...medicalHistory.diagnoses];
                                    updated[index] = { ...updated[index], status: value };
                                    setMedicalHistory((prev) => ({ ...prev, diagnoses: updated }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Resolved">Resolved</SelectItem>
                                    <SelectItem value="Controlled">Controlled</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Condition Name</Label>
                              <Input
                                value={diagnosis.name}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.diagnoses];
                                  updated[index] = { ...updated[index], name: e.target.value };
                                  setMedicalHistory((prev) => ({ ...prev, diagnoses: updated }));
                                }}
                                placeholder="e.g., Essential Hypertension"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Diagnosed Date</Label>
                              <Input
                                type="date"
                                value={diagnosis.diagnosedDate || ''}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.diagnoses];
                                  updated[index] = {
                                    ...updated[index],
                                    diagnosedDate: e.target.value,
                                  };
                                  setMedicalHistory((prev) => ({ ...prev, diagnoses: updated }));
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Surgical History</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setMedicalHistory((prev) => ({
                            ...prev,
                            surgicalHistory: [
                              ...prev.surgicalHistory,
                              { procedure: '', date: '', hospital: '' },
                            ],
                          }))
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Surgery
                      </Button>
                    </div>
                    {medicalHistory.surgicalHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No surgical history recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {medicalHistory.surgicalHistory.map((surgery, index) => (
                          <div key={index} className="p-3 border rounded-lg space-y-2">
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() =>
                                  setMedicalHistory((prev) => ({
                                    ...prev,
                                    surgicalHistory: prev.surgicalHistory.filter((_, i) => i !== index),
                                  }))
                                }
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <Input
                                value={surgery.procedure}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index] = { ...updated[index], procedure: e.target.value };
                                  setMedicalHistory((prev) => ({
                                    ...prev,
                                    surgicalHistory: updated,
                                  }));
                                }}
                                placeholder="Procedure"
                                className="h-8 text-xs"
                              />
                              <Input
                                type="date"
                                value={surgery.date}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index] = { ...updated[index], date: e.target.value };
                                  setMedicalHistory((prev) => ({
                                    ...prev,
                                    surgicalHistory: updated,
                                  }));
                                }}
                                className="h-8 text-xs"
                              />
                              <Input
                                value={surgery.hospital}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index] = { ...updated[index], hospital: e.target.value };
                                  setMedicalHistory((prev) => ({
                                    ...prev,
                                    surgicalHistory: updated,
                                  }));
                                }}
                                placeholder="Hospital"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Family History</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setMedicalHistory((prev) => ({
                            ...prev,
                            familyHistory: [...prev.familyHistory, { relation: '', condition: '' }],
                          }))
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {medicalHistory.familyHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No family history recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {medicalHistory.familyHistory.map((item, index) => (
                          <div key={index} className="flex gap-2 items-start">
                            <Input
                              value={item.relation}
                              onChange={(e) => {
                                const updated = [...medicalHistory.familyHistory];
                                updated[index] = { ...updated[index], relation: e.target.value };
                                setMedicalHistory((prev) => ({ ...prev, familyHistory: updated }));
                              }}
                              placeholder="Relation"
                              className="h-8 text-xs"
                            />
                            <Input
                              value={item.condition}
                              onChange={(e) => {
                                const updated = [...medicalHistory.familyHistory];
                                updated[index] = { ...updated[index], condition: e.target.value };
                                setMedicalHistory((prev) => ({ ...prev, familyHistory: updated }));
                              }}
                              placeholder="Condition"
                              className="h-8 text-xs"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0"
                              onClick={() =>
                                setMedicalHistory((prev) => ({
                                  ...prev,
                                  familyHistory: prev.familyHistory.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Social History</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Smoking</Label>
                        <Select
                          value={medicalHistory.socialHistory.smoking || undefined}
                          onValueChange={(value) =>
                            setMedicalHistory((prev) => ({
                              ...prev,
                              socialHistory: { ...prev.socialHistory, smoking: value },
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Never">Never</SelectItem>
                            <SelectItem value="Former">Former</SelectItem>
                            <SelectItem value="Current">Current</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Alcohol</Label>
                        <Select
                          value={medicalHistory.socialHistory.alcohol || undefined}
                          onValueChange={(value) =>
                            setMedicalHistory((prev) => ({
                              ...prev,
                              socialHistory: { ...prev.socialHistory, alcohol: value },
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Never">Never</SelectItem>
                            <SelectItem value="Occasional">Occasional (social)</SelectItem>
                            <SelectItem value="Regular">Regular</SelectItem>
                            <SelectItem value="Heavy">Heavy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Exercise</Label>
                        <Input
                          value={medicalHistory.socialHistory.exercise}
                          onChange={(e) =>
                            setMedicalHistory((prev) => ({
                              ...prev,
                              socialHistory: {
                                ...prev.socialHistory,
                                exercise: e.target.value,
                              },
                            }))
                          }
                          placeholder="e.g., 2-3 times per week"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Occupation is set under Personal (same as registration).
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium">Next of Kin</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Surname</Label>
                        <Input
                          value={editForm.nokSurname}
                          onChange={(e) => patch({ nokSurname: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input
                          value={editForm.nokFirstName}
                          onChange={(e) => patch({ nokFirstName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Middle Name</Label>
                        <Input
                          value={editForm.nokMiddleName}
                          onChange={(e) => patch({ nokMiddleName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Relationship</Label>
                        <Select
                          value={editForm.nokRelationship || undefined}
                          onValueChange={(v) =>
                            patch({ nokRelationship: v === 'not-specified' ? '' : v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not-specified">Unspecified</SelectItem>
                            {NOK_RELATIONSHIPS.map((rel) => (
                              <SelectItem key={rel} value={rel}>
                                {rel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={editForm.nokPhone}
                          onChange={(e) => patch({ nokPhone: e.target.value })}
                          placeholder="+234..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={editForm.nokAddress}
                        onChange={(e) => patch({ nokAddress: e.target.value })}
                        placeholder="Next of kin address"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSubmitting || editFormLoading || !selectedPatient}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Edit className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
