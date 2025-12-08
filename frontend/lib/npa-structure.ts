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
