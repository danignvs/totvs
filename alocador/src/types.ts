export interface Analyst {
  id: string;
  name: string;
  competencies: string[]; // e.g. ["React", "Node.js"]
  availability: { [dateStr: string]: number }; // YYYY-MM-DD -> hours
  allocatedHours?: { [dateStr: string]: number }; // YYYY-MM-DD -> original raw allocated hours (for display/validation)
}

export interface Project {
  id: string;
  name: string;
  requiredCompetencies: string[]; // e.g. ["React"]
  totalHours: number;
  originalHeaders?: string[]; // The original column headers from the CSV
  rawRow?: Record<string, string>; // The original raw row values map of header -> cell value
  assignedAnalystName?: string; // e.g. "Andre Castro"
  prefixRows?: string[][]; // Rows before the header (like Dias do Mês and day numbers)
  headerRowIndex?: number; // Index of the header row in the original CSV
}

export interface AllocationEntry {
  date: string; // YYYY-MM-DD
  hours: number;
  reason?: string; // e.g., if there's any note
}

export interface ProjectAllocation {
  projectId: string;
  projectName: string;
  analystId: string;
  analystName: string;
  allocations: AllocationEntry[]; // Daily breakdown
  totalAllocatedHours: number;
}

export interface AllocationResult {
  projectAllocations: ProjectAllocation[];
  unallocatedProjects: { project: Project; remainingHours: number; reason: string }[];
  analystSchedules: {
    [analystId: string]: {
      [dateStr: string]: {
        allocatedHours: number;
        projects: { projectName: string; hours: number }[];
      };
    };
  };
}
