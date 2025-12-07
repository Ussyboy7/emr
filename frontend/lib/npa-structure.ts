export type GradeLevel = {
  code: string;
  name: string;
  level: number;
  systemRole:
    | 'Staff'
    | 'Officer'
    | 'Senior Officer'
    | 'Assistant Manager'
    | 'Manager'
    | 'Senior Manager'
    | 'Principal Manager'
    | 'Assistant General Manager'
    | 'General Manager'
    | 'Executive Director'
    | 'Managing Director'
    | 'Secretary'
    | 'Assistant'
    | 'Super Admin';
  approvalAuthority: number;
};

export type Directorate = {
  id: string;
  name: string;
  code?: string;
  shortName?: string;
  description?: string;
  executiveDirectorId?: string;
  isActive?: boolean;
};

export type Division = {
  id: string;
  name: string;
  code?: string;
  shortName?: string;
  directorateId?: string;
  generalManagerId?: string | null;
  description?: string;
  isActive?: boolean;
};

export type Department = {
  id: string;
  name: string;
  code?: string;
  shortName?: string;
  divisionId?: string;
  assistantGeneralManagerId?: string | null;
  description?: string;
  isActive?: boolean;
};

export type Office = {
  id: string;
  name: string;
  code: string;
  officeType: string;
  directorateId?: string | null;
  divisionId?: string | null;
  departmentId?: string | null;
  parentId?: string | null;
  description?: string;
  isActive: boolean;
  allowExternalIntake: boolean;
  allowLateralRouting: boolean;
};

export type OfficeMembership = {
  id: string;
  officeId: string;
  officeName?: string;
  userId: string;
  assignmentRole: string;
  isPrimary: boolean;
  canRegister: boolean;
  canRoute: boolean;
  canApprove: boolean;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
};

export type DistributionRecipient = {
  id: string;
  type: 'division' | 'department' | 'directorate';
  directorateId?: string;
  divisionId?: string;
  departmentId?: string;
  name?: string;
  addedById?: string;
  addedByName?: string;
  addedAt?: string;
  purpose?: 'information' | 'action' | 'comment';
};

export type CorrespondenceAttachment = {
  id: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Correspondence = {
  id: string;
  referenceNumber: string;
  subject: string;
  documentType?: string;
  senderReference?: string;
  letterDate?: string;
  dispatchDate?: string;
  source: 'internal' | 'external';
  receivedDate: string;
  completedAt?: string;
  senderName: string;
  senderOrganization: string;
  senderEmail?: string;
  senderPhone?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  divisionId?: string;
  departmentId?: string;
  directorateId?: string;
  currentApproverId?: string;
  createdById?: string;
  direction: 'upward' | 'downward';
  currentApproverName?: string;
  createdByName?: string;
  owningOfficeId?: string;
  owningOfficeName?: string;
  currentOfficeId?: string;
  currentOfficeName?: string;
  recipientName?: string;
  remarks?: string;
  attachments?: CorrespondenceAttachment[];
  distribution?: DistributionRecipient[];
  archiveLevel?: 'department' | 'division' | 'directorate';
  linkedDocumentIds?: string[];
  completionPackage?: {
    documentId: string;
    title: string;
    fileUrl?: string;
    generatedAt?: string;
  } | null;
  completionSummaryGeneratedAt?: string;
  // Parallel routing fields
  workflowState?: 'sequential' | 'parallel' | 'merged' | 'waiting_merge';
  activeParallelBranches?: number;
  completedParallelBranches?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MinuteSignaturePayload = {
  imageData: string;
  appliedAt: string;
  fileName?: string;
  templateId?: string;
  templateType?: 'approval' | 'minute' | 'forward' | 'treatment';
  renderedText?: string;
};

export type Minute = {
  id: string;
  correspondenceId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userSystemRole?: string;
  gradeLevel: string;
  actionType: 'minute' | 'forward' | 'approve' | 'reject' | 'treat';
  minuteText: string;
  direction: 'upward' | 'downward';
  stepNumber: number;
  timestamp: string;
  actedBySecretary?: boolean;
  actedByAssistant?: boolean;
  assistantType?: 'TA' | 'PA';
  readAt?: string;
  mentions?: string[];
  signature?: MinuteSignaturePayload;
  fromOfficeId?: string;
  fromOfficeName?: string;
  // Recall/Edit fields
  isEdited?: boolean;
  editedAt?: string;
  editWindowExpiresAt?: string;
  isOpened?: boolean;
  openedAt?: string;
  originalMinuteText?: string;
  editHistory?: Array<{
    edited_at: string;
    edited_by: string;
    old_text: string;
    new_text: string;
  }>;
  canBeEdited?: boolean;
  isRecalled?: boolean;
  recalledAt?: string;
  recallReason?: string;
  canBeRecalled?: boolean;
  // Purpose-based routing
  purpose?: 'action' | 'information' | 'comment' | 'approval';
  requiresResponse?: boolean;
  responseDeadline?: string;
  // Parallel routing fields
  routingType?: 'sequential' | 'parallel' | 'broadcast';
  parallelGroupId?: string;
  isParallelBranch?: boolean;
  parentMinuteId?: string;
  mergeStrategy?: 'all' | 'independent' | 'any' | 'majority';
  // Branch originator tracking
  branchOriginatorId?: string;
  branchOriginatorName?: string;
  // Consultation routing
  isConsultation?: boolean;
  consultationFromBranchId?: string;
  consultationToBranchId?: string;
  // Additional minutes/instructions
  minuteType?: 'routing' | 'instruction' | 'clarification' | 'addendum';
  isAdditional?: boolean;
  relatesToMinuteId?: string;
  toOfficeId?: string;
  toOfficeName?: string;
  toUserId?: string;
  toUserName?: string;
};

export type ParallelRoutingGroup = {
  id: string;
  correspondenceId: string;
  createdById: string;
  createdByName?: string;
  mergeStrategy: 'all' | 'independent' | 'any' | 'majority';
  isComplete: boolean;
  completedAt?: string;
  totalBranches: number;
  completedBranches: number;
  createdAt?: string;
  updatedAt?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  gradeLevel: string;
  directorate?: string;
  division?: string;
  department?: string;
  systemRole: string;
  avatar?: string;
  active: boolean;
  username?: string;
  isSuperuser?: boolean;
};

export function getGradeLevels(): GradeLevel[] {
  return [
    { code: 'JSS3', name: 'Staff III', level: 4, systemRole: 'Staff', approvalAuthority: 1 },
    { code: 'JSS2', name: 'Staff II', level: 5, systemRole: 'Staff', approvalAuthority: 1 },
    { code: 'JSS1', name: 'Staff I', level: 6, systemRole: 'Staff', approvalAuthority: 2 },
    { code: 'SSS4', name: 'Officer II', level: 8, systemRole: 'Officer', approvalAuthority: 2 },
    { code: 'SSS3', name: 'Officer I', level: 9, systemRole: 'Officer', approvalAuthority: 3 },
    { code: 'SSS2', name: 'Senior Officer', level: 10, systemRole: 'Senior Officer', approvalAuthority: 3 },
    { code: 'SSS1', name: 'Assistant Manager', level: 12, systemRole: 'Assistant Manager', approvalAuthority: 4 },
    { code: 'MSS5', name: 'Manager', level: 13, systemRole: 'Manager', approvalAuthority: 5 },
    { code: 'MSS4', name: 'Senior Manager', level: 14, systemRole: 'Senior Manager', approvalAuthority: 6 },
    { code: 'MSS3', name: 'Principal Manager', level: 15, systemRole: 'Principal Manager', approvalAuthority: 7 },
    { code: 'MSS2', name: 'Assistant General Manager', level: 16, systemRole: 'Assistant General Manager', approvalAuthority: 8 },
    { code: 'MSS1', name: 'General Manager', level: 17, systemRole: 'General Manager', approvalAuthority: 9 },
    { code: 'EDCS', name: 'Executive Director', level: 18, systemRole: 'Executive Director', approvalAuthority: 10 },
    { code: 'MDCS', name: 'Managing Director', level: 19, systemRole: 'Managing Director', approvalAuthority: 11 },
  ];
}

// Export as const for backward compatibility
export const GRADE_LEVELS = getGradeLevels();

export const getGradeLevelByCode = (code?: string | null): GradeLevel | undefined => {
  if (!code) return undefined;
  return GRADE_LEVELS.find((grade) => grade.code === code);
};

export const getGradeLabel = (code?: string | null) => getGradeLevelByCode(code)?.name;

export const getApprovalAuthority = (code?: string | null) => getGradeLevelByCode(code)?.approvalAuthority;

// Organization cache functions removed - using mock data for EMR
export const updateOrganizationCache = () => {};
export const getOrganizationSnapshot = () => null;
export const getDirectorateById = () => null;
export const getDivisionById = () => null;
export const getDepartmentById = () => null;
export const getUserById = () => null;
