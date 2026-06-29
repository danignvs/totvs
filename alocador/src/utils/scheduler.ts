import { Analyst, Project, AllocationResult, ProjectAllocation, AllocationEntry } from "../types";
import { parseDateKey, checkHolidayOrWeekend } from "./holidays";

/**
 * Returns a key to identify projects that should be grouped together (same code or name).
 */
export function getProjectGroupKey(project: Project): string {
  if (project.rawRow) {
    const keys = Object.keys(project.rawRow);
    
    // 1. Search for a code key ("código", "codigo", "cod", "cod.")
    const codeKey = keys.find(k => {
      const nk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return nk === "codigo" || nk === "cod" || nk === "cod." || nk.startsWith("codigo") || nk.includes("codigo") || nk.includes("codigo do projeto");
    });
    if (codeKey && project.rawRow[codeKey]?.trim()) {
      return project.rawRow[codeKey].trim();
    }
    
    // 2. Search for a project/name key ("projeto", "project")
    const nameKey = keys.find(k => {
      const nk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return nk === "projeto" || nk === "project" || nk.includes("projeto") || nk.includes("project");
    });
    if (nameKey && project.rawRow[nameKey]?.trim()) {
      return project.rawRow[nameKey].trim();
    }
  }
  return project.name;
}

/**
 * Checks if an analyst is compatible with the project requirements.
 */
export function isAnalystCompatible(
  analyst: Analyst,
  project: Project,
  strategy: "any" | "all" = "any"
): boolean {
  const reqs = project.requiredCompetencies;
  if (!reqs || reqs.length === 0) {
    return true; // No special skills needed, generalist
  }

  const analystSkills = analyst.competencies.map(s => s.toLowerCase().trim());
  const projectSkills = reqs.map(s => s.toLowerCase().trim());

  if (strategy === "all") {
    // Must have ALL of the project skills
    return projectSkills.every(skill => analystSkills.includes(skill));
  } else {
    // Must have AT LEAST ONE of the project skills
    return projectSkills.some(skill => analystSkills.includes(skill));
  }
}

/**
 * Main allocation engine.
 */
export function allocateProjects(
  analysts: Analyst[],
  projects: Project[],
  options: {
    matchingStrategy: "any" | "all";
    sortProjectsBy: "largest_hours" | "smallest_hours" | "original";
    year: number;
    month: number;
  }
): AllocationResult {
  const targetYear = options.year;
  const targetMonth = options.month;

  // Deep copy analyst availability and map/generate keys for the selected month/year
  const tempAnalysts: Analyst[] = analysts.map(a => {
    const newAvailability: { [dateStr: string]: number } = {};
    const availabilityKeys = Object.keys(a.availability);
    const hasDates = availabilityKeys.length > 0;

    if (hasDates) {
      // Shift day numbers of existing availability to target month and year
      availabilityKeys.forEach(dateStr => {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const dayNum = parseInt(parts[2], 10);
          const pad = (num: number) => num.toString().padStart(2, "0");
          const newKey = `${targetYear}-${pad(targetMonth)}-${pad(dayNum)}`;

          // Keep availability only if it is not a weekend or holiday in target period
          const targetDateObj = new Date(targetYear, targetMonth - 1, dayNum);
          const check = checkHolidayOrWeekend(targetDateObj);
          if (!check.isHoliday) {
            newAvailability[newKey] = a.availability[dateStr];
          }
        }
      });
    } else {
      // Generate default 8h on workdays for the entire target month
      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      const pad = (num: number) => num.toString().padStart(2, "0");
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(targetYear, targetMonth - 1, d);
        const check = checkHolidayOrWeekend(dateObj);
        if (!check.isHoliday) {
          const dateStr = `${targetYear}-${pad(targetMonth)}-${pad(d)}`;
          newAvailability[dateStr] = 8;
        }
      }
    }

    return {
      ...a,
      competencies: [...a.competencies],
      availability: newAvailability
    };
  });

  // Create virtual analysts for assigned analysts not present in tempAnalysts
  projects.forEach(project => {
    if (project.assignedAnalystName && project.assignedAnalystName !== "" && project.assignedAnalystName.toLowerCase() !== "definir") {
      const name = project.assignedAnalystName.trim();
      const exists = tempAnalysts.some(a => a.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (!exists) {
        const newAnalystId = "dynamic-" + Math.random().toString(36).substr(2, 9);
        const availability: { [dateStr: string]: number } = {};
        
        // Generate availability for all days of the month (excluding weekends and holidays)
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const pad = (num: number) => num.toString().padStart(2, "0");
        
        for (let d = 1; d <= daysInMonth; d++) {
          const dateObj = new Date(targetYear, targetMonth - 1, d);
          const check = checkHolidayOrWeekend(dateObj);
          if (!check.isHoliday) {
            const dateStr = `${targetYear}-${pad(targetMonth)}-${pad(d)}`;
            availability[dateStr] = 8; // default 8 hours on workdays
          }
        }

        tempAnalysts.push({
          id: newAnalystId,
          name,
          competencies: [],
          availability
        });
      }
    }
  });

  // Sort projects according to choice, keeping tasks of the same project group together
  const groups: { [key: string]: Project[] } = {};
  const groupOrder: string[] = []; // to preserve original order of groups
  
  projects.forEach(p => {
    const key = getProjectGroupKey(p);
    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push(p);
  });

  const groupTotalHours: { [key: string]: number } = {};
  Object.keys(groups).forEach(key => {
    groupTotalHours[key] = groups[key].reduce((sum, p) => sum + p.totalHours, 0);
  });

  const sortedGroupKeys = [...groupOrder];
  if (options.sortProjectsBy === "largest_hours") {
    sortedGroupKeys.sort((a, b) => groupTotalHours[b] - groupTotalHours[a]);
  } else if (options.sortProjectsBy === "smallest_hours") {
    sortedGroupKeys.sort((a, b) => groupTotalHours[a] - groupTotalHours[b]);
  }

  const sortedProjects: Project[] = [];
  sortedGroupKeys.forEach(key => {
    sortedProjects.push(...groups[key]);
  });

  const projectAllocations: ProjectAllocation[] = [];
  const unallocatedProjects: AllocationResult["unallocatedProjects"] = [];
  const analystSchedules: AllocationResult["analystSchedules"] = {};

  // Initialize schedules
  tempAnalysts.forEach(a => {
    analystSchedules[a.id] = {};
  });

  // Helper to add allocation to final scheduler track
  const recordAllocationInSchedule = (
    analystId: string,
    dateStr: string,
    projectName: string,
    allocatedHours: number
  ) => {
    if (!analystSchedules[analystId][dateStr]) {
      analystSchedules[analystId][dateStr] = {
        allocatedHours: 0,
        projects: []
      };
    }
    analystSchedules[analystId][dateStr].allocatedHours += allocatedHours;
    analystSchedules[analystId][dateStr].projects.push({
      projectName,
      hours: allocatedHours
    });
  };

  // Process each project
  for (const project of sortedProjects) {
    let remainingHours = project.totalHours;

    // Filter compatible analysts
    let compatibleAnalysts = tempAnalysts.filter(a =>
      isAnalystCompatible(a, project, options.matchingStrategy)
    );

    // If there is an assigned analyst name, restrict strictly to that analyst
    if (project.assignedAnalystName && project.assignedAnalystName !== "" && project.assignedAnalystName.toLowerCase() !== "definir") {
      const target = tempAnalysts.find(a => a.name.toLowerCase().trim() === project.assignedAnalystName!.toLowerCase().trim());
      if (target) {
        compatibleAnalysts = [target];
      }
    }

    if (compatibleAnalysts.length === 0) {
      unallocatedProjects.push({
        project,
        remainingHours,
        reason: "Nenhum analista compatível possui as competências requeridas."
      });
      continue;
    }

    // Try to find a SINGLE analyst who can do the whole project with the minimum number of days
    let bestSingleAnalyst: Analyst | null = null;
    let bestSingleWindow: {
      datesToUse: { date: string; hoursToAllocate: number }[];
      daysUsed: number;
      earliestDate: string;
      totalAvailableHours: number;
    } | null = null;

    for (const analyst of compatibleAnalysts) {
      // Get all available dates with hours > 0, sorted primarily by available hours descending, and secondarily by date chronologically
      const sortedAvailableDays = Object.entries(analyst.availability)
        .filter(([_, h]) => h > 0)
        .map(([d, h]) => ({ dateStr: d, hours: h }))
        .sort((a, b) => {
          if (b.hours !== a.hours) {
            return b.hours - a.hours; // Largest availability first (minimizes splits)
          }
          return a.dateStr.localeCompare(b.dateStr); // Chronological tie-breaker
        });

      let accumulated = 0;
      const datesToUse: { date: string; hoursToAllocate: number }[] = [];

      for (const day of sortedAvailableDays) {
        if (accumulated >= remainingHours) break;
        const hoursNeeded = remainingHours - accumulated;
        const hoursToAllocate = Math.min(day.hours, hoursNeeded);
        datesToUse.push({ date: day.dateStr, hoursToAllocate });
        accumulated += hoursToAllocate;
      }

      if (accumulated >= remainingHours) {
        const daysUsed = datesToUse.length;
        const selectedDates = datesToUse.map(d => d.date);
        selectedDates.sort(); // sort chronologically
        const earliestDate = selectedDates[0] || "";
        const totalAvailableHours = Object.values(analyst.availability).reduce((sum, h) => sum + h, 0);

        let isBetter = false;
        if (!bestSingleWindow) {
          isBetter = true;
        } else if (daysUsed < bestSingleWindow.daysUsed) {
          isBetter = true;
        } else if (daysUsed === bestSingleWindow.daysUsed) {
          if (earliestDate < bestSingleWindow.earliestDate) {
            isBetter = true;
          } else if (earliestDate === bestSingleWindow.earliestDate) {
            if (totalAvailableHours > bestSingleWindow.totalAvailableHours) {
              isBetter = true;
            }
          }
        }

        if (isBetter) {
          bestSingleWindow = {
            datesToUse,
            daysUsed,
            earliestDate,
            totalAvailableHours
          };
          bestSingleAnalyst = analyst;
        }
      }
    }

    // If we found a single analyst who can handle the entire project
    if (bestSingleAnalyst && bestSingleWindow) {
      const analyst: Analyst = bestSingleAnalyst;
      const entries: AllocationEntry[] = [];

      // Sort the allocated dates chronologically for the final result view so that it looks neat
      const chronologicalDatesToUse = [...bestSingleWindow.datesToUse].sort((a, b) => a.date.localeCompare(b.date));

      for (const alloc of chronologicalDatesToUse) {
        // Deduct hours from analyst availability
        analyst.availability[alloc.date] -= alloc.hoursToAllocate;

        entries.push({
          date: alloc.date,
          hours: alloc.hoursToAllocate
        });

        recordAllocationInSchedule(analyst.id, alloc.date, project.name, alloc.hoursToAllocate);
      }

      projectAllocations.push({
        projectId: project.id,
        projectName: project.name,
        analystId: analyst.id,
        analystName: analyst.name,
        allocations: entries,
        totalAllocatedHours: project.totalHours
      });

      remainingHours = 0;
      continue;
    }

    // If NO single analyst can fit the entire project:
    // We must split the project across multiple analysts.
    // To minimize the number of splits, we select analysts who have the most total available hours.
    const projectSplits: {
      analystId: string;
      analystName: string;
      entries: AllocationEntry[];
      hoursAllocated: number;
    }[] = [];

    while (remainingHours > 0) {
      // Find the compatible analyst with the largest total available hours remaining
      let selectedAnalyst: Analyst | null = null;
      let maxAvailableHours = 0;

      for (const analyst of compatibleAnalysts) {
        const totalAvail = Object.values(analyst.availability).reduce((sum, h) => sum + h, 0);
        if (totalAvail > maxAvailableHours) {
          maxAvailableHours = totalAvail;
          selectedAnalyst = analyst;
        }
      }

      if (!selectedAnalyst || maxAvailableHours === 0) {
        // No more availability in compatible analysts
        break;
      }

      const analyst: Analyst = selectedAnalyst;
      
      // Get chronological available dates for this analyst, sorted primarily by available hours descending to minimize splitting
      const availableDates = Object.entries(analyst.availability)
        .filter(([_, h]) => h > 0)
        .map(([d, h]) => ({ dateStr: d, hours: h }))
        .sort((a, b) => {
          if (b.hours !== a.hours) {
            return b.hours - a.hours; // Largest availability first (minimizes splits)
          }
          return a.dateStr.localeCompare(b.dateStr); // Chronological tie-breaker
        });

      const entries: AllocationEntry[] = [];
      let allocatedToThisAnalyst = 0;

      // Allocate as much of this analyst's availability as needed, consecutively from the start
      for (const day of availableDates) {
        if (remainingHours <= 0) break;

        const hoursToAllocate = Math.min(day.hours, remainingHours);
        analyst.availability[day.dateStr] -= hoursToAllocate;
        remainingHours -= hoursToAllocate;
        allocatedToThisAnalyst += hoursToAllocate;

        entries.push({
          date: day.dateStr,
          hours: hoursToAllocate
        });

        recordAllocationInSchedule(analyst.id, day.dateStr, project.name, hoursToAllocate);
      }

      if (allocatedToThisAnalyst > 0) {
        // Sort entries chronologically for neat display
        entries.sort((a, b) => a.date.localeCompare(b.date));

        projectSplits.push({
          analystId: analyst.id,
          analystName: analyst.name,
          entries,
          hoursAllocated: allocatedToThisAnalyst
        });
      }
    }

    // Merge split results into projectAllocations
    if (projectSplits.length > 0) {
      projectSplits.forEach(split => {
        projectAllocations.push({
          projectId: project.id,
          projectName: project.name,
          analystId: split.analystId,
          analystName: split.analystName,
          allocations: split.entries,
          totalAllocatedHours: split.hoursAllocated
        });
      });
    }

    // If there is still a deficit, log it as unallocated
    if (remainingHours > 0) {
      unallocatedProjects.push({
        project,
        remainingHours,
        reason:
          project.totalHours === remainingHours
            ? "Nenhum analista compatível possui horas disponíveis."
            : `Capacidade esgotada. Faltaram ${remainingHours}h de ${project.totalHours}h do projeto.`
      });
    }
  }

  return {
    projectAllocations,
    unallocatedProjects,
    analystSchedules
  };
}

/**
 * Creates formatted TSV content of the project allocations table, perfect for pasting directly into Google Sheets.
 */
export function generateTSVForGoogleSheets(
  result: AllocationResult,
  projects: Project[]
): string {
  // We want to create a wide matrix grid suitable for Google Sheets.
  // Columns: Projeto | Competências Requeridas | Total Horas | Analista | Data Alocação | Horas Alocadas
  // Or, even better: A pivot table matrix with dates as columns!
  // Let's generate a list table, which is very robust for filters and lookups:
  // Projeto \t Competências Requeridas \t Horas Totais \t Analista \t Data \t Horas Alocadas
  
  const headers = ["Projeto", "Competências Requeridas", "Total Horas Projeto", "Analista Alocado", "Data de Alocação", "Horas Alocadas no Dia"];
  const rows = [headers.join("\t")];

  result.projectAllocations.forEach(alloc => {
    const projectObj = projects.find(p => p.id === alloc.projectId);
    const reqs = projectObj?.requiredCompetencies.join(", ") || "";
    const totalProjHours = projectObj?.totalHours || alloc.totalAllocatedHours;

    alloc.allocations.forEach(entry => {
      // Format date to local standard DD/MM/YYYY
      const [y, m, d] = entry.date.split("-");
      const brDate = `${d}/${m}/${y}`;
      
      const row = [
        alloc.projectName,
        reqs,
        totalProjHours.toString().replace(".", ","), // Portuguese comma decimals
        alloc.analystName,
        brDate,
        entry.hours.toString().replace(".", ",")
      ];
      rows.push(row.join("\t"));
    });
  });

  // Also include unallocated projects for completeness
  result.unallocatedProjects.forEach(un => {
    const reqs = un.project.requiredCompetencies.join(", ") || "";
    const row = [
      un.project.name,
      reqs,
      un.project.totalHours.toString().replace(".", ","),
      "NÃO ALOCADO",
      "-",
      un.remainingHours.toString().replace(".", ",")
    ];
    rows.push(row.join("\t"));
  });

  return rows.join("\n");
}

/**
 * Generates an alternative matrix view (Analysts x Dates) suitable for copy-pasting directly into a planner sheet.
 */
export function generateMatrixTSVForGoogleSheets(
  result: AllocationResult,
  analysts: Analyst[]
): string {
  // We need to find the range of dates that have ANY allocations
  const allocatedDates = new Set<string>();
  result.projectAllocations.forEach(pa => {
    pa.allocations.forEach(a => allocatedDates.add(a.date));
  });

  const sortedDates = Array.from(allocatedDates).sort();

  // If no dates, return empty message
  if (sortedDates.length === 0) {
    return "Nenhuma alocação realizada.";
  }

  // Format headers: Analista | Competências | [DD/MM/YYYY] ...
  const formattedDates = sortedDates.map(dateStr => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  });

  const headers = ["Analista", "Competências", ...formattedDates];
  const rows = [headers.join("\t")];

  analysts.forEach(analyst => {
    const rowCells = [analyst.name, analyst.competencies.join(", ")];
    
    sortedDates.forEach(dateStr => {
      const schedule = result.analystSchedules[analyst.id]?.[dateStr];
      if (schedule && schedule.allocatedHours > 0) {
        // Show hours or the format "8h (Proj A)"
        // Let's just output the hours number so they can easily sum it in Excel, or list the projects
        const projectsStr = schedule.projects.map(p => `${p.projectName}: ${p.hours}h`).join(" | ");
        rowCells.push(`${schedule.allocatedHours.toString().replace(".", ",")} (${projectsStr})`);
      } else {
        rowCells.push("0");
      }
    });

    rows.push(rowCells.join("\t"));
  });

  return rows.join("\n");
}

/**
 * Generates the project-centric matrix TSV exactly as requested by the user.
 * It uses the original CSV headers and rows, then appends the days of the month (1 to maxDays) and totals.
 */
export function generateProjectCentricMatrixTSV(
  result: AllocationResult,
  projects: Project[],
  selectedYear?: number,
  selectedMonth?: number
): string {
  if (projects.length === 0) return "Nenhum projeto encontrado.";

  let year = selectedYear || 2026;
  let month = selectedMonth || 4;

  if (!selectedYear || !selectedMonth) {
    // Find all dates referenced across all allocations
    const allocatedDates = new Set<string>();
    result.projectAllocations.forEach(pa => {
      pa.allocations.forEach(a => allocatedDates.add(a.date));
    });
    const sortedDates = Array.from(allocatedDates).sort();

    if (sortedDates.length > 0) {
      const [y, m] = sortedDates[0].split("-");
      year = parseInt(y);
      month = parseInt(m);
    }
  }
  const maxDays = new Date(year, month, 0).getDate();

  // Find original headers and prefixRows
  const firstProject = projects[0];
  const originalHeaders = [...(firstProject?.originalHeaders || ["Código", "Projeto", "Tarefa", "Horas", "Analista"])];
  const hasAnalystHeader = originalHeaders.some(h => {
    const nh = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return nh.includes("analista") || nh.includes("analyst");
  });
  if (!hasAnalystHeader) {
    originalHeaders.push("Analista");
  }
  const prefixRows = firstProject?.prefixRows || [];

  const rows: string[][] = [];

  // Determine day column mappings
  let dayColMapping: Record<number, number> = {};
  if (prefixRows.length > 0) {
    // Scan prefixRows from bottom up to find the day numbers row
    for (let i = prefixRows.length - 1; i >= 0; i--) {
      const row = prefixRows[i];
      const mappings: Record<number, number> = {};
      let count = 0;
      row.forEach((cell, colIdx) => {
        const val = parseInt(cell.trim());
        if (!isNaN(val) && val >= 1 && val <= 31) {
          mappings[val] = colIdx;
          count++;
        }
      });
      if (count >= 15) {
        dayColMapping = mappings;
        break;
      }
    }
  }

  // If no day mappings found, default them starting right after the original headers
  if (Object.keys(dayColMapping).length === 0) {
    for (let d = 1; d <= maxDays; d++) {
      dayColMapping[d] = originalHeaders.length + d - 1;
    }
  }

  // Find where Total column should be
  let totalColIdx = originalHeaders.findIndex(h => {
    const nh = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return nh === "total" || nh === "total alocado" || nh.includes("total");
  });
  if (totalColIdx === -1) {
    const maxColIdx = Math.max(...Object.values(dayColMapping), originalHeaders.length - 1);
    totalColIdx = maxColIdx + 1;
  }

  // Add prefix rows to the final table
  if (prefixRows.length > 0) {
    prefixRows.forEach(prefRow => {
      rows.push([...prefRow]);
    });
    // Add original headers
    rows.push([...originalHeaders]);
  } else {
    // Generate standard prefix rows dynamically
    const row1Cells = Array(originalHeaders.length).fill("");
    row1Cells.push("Dias do Mês");
    for (let i = 1; i < maxDays; i++) row1Cells.push("");
    row1Cells.push("Total");
    rows.push(row1Cells);

    const row2Cells = Array(originalHeaders.length).fill("");
    for (let d = 1; d <= maxDays; d++) {
      row2Cells.push(d.toString());
    }
    row2Cells.push("");
    rows.push(row2Cells);

    const row3Cells = [...originalHeaders];
    for (let d = 1; d <= maxDays; d++) {
      row3Cells.push("");
    }
    row3Cells.push("Total Alocado");
    rows.push(row3Cells);
  }

  const pad = (num: number) => num.toString().padStart(2, "0");

  // Add each project in original sequence
  projects.forEach(project => {
    const allocationsForProj = result.projectAllocations.filter(pa => pa.projectId === project.id);
    
    const generateRow = (analystName: string, allocationsToMap: typeof result.projectAllocations[0] | null, isSplit: boolean, splitIdx: number) => {
      const rowCells: string[] = [];
  
      // 1. Fill base cells from original row
      originalHeaders.forEach((header, colIdx) => {
        let cellVal = project.rawRow ? (project.rawRow[header] || "") : "";
        const normHeader = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (normHeader.includes("analista") || normHeader.includes("analyst")) {
          cellVal = analystName;
        } else if (isSplit && (normHeader === "tarefa" || normHeader === "nome da tarefa" || normHeader === "nome do projeto" || normHeader === "projeto")) {
          if (cellVal) {
             cellVal = cellVal + ` (${splitIdx + 1})`;
          }
        }
        rowCells[colIdx] = cellVal;
      });
  
      // 2. Fetch allocations
      const allocationsMap: Record<string, number> = {};
      let totalAllocated = 0;
      
      if (allocationsToMap) {
        allocationsToMap.allocations.forEach(alloc => {
          allocationsMap[alloc.date] = (allocationsMap[alloc.date] || 0) + alloc.hours;
          totalAllocated += alloc.hours;
        });
      }
  
      // Ensure all other cells in between are initialized to empty
      const highestColIdx = Math.max(totalColIdx, ...Object.values(dayColMapping));
      for (let i = 0; i <= highestColIdx; i++) {
        if (rowCells[i] === undefined) {
          rowCells[i] = "";
        }
      }
  
      // 3. Fill day columns
      for (let d = 1; d <= maxDays; d++) {
        const colIdx = dayColMapping[d];
        if (colIdx !== undefined) {
          const dateKey = `${year}-${pad(month)}-${pad(d)}`;
          const hours = allocationsMap[dateKey];
          if (hours && hours > 0) {
            rowCells[colIdx] = hours.toString().replace(".", ",");
          } else {
            rowCells[colIdx] = "";
          }
        }
      }
  
      // 4. Fill Total column
      rowCells[totalColIdx] = totalAllocated.toString().replace(".", ",");
      return rowCells;
    };

    if (allocationsForProj.length === 0) {
      rows.push(generateRow(project.assignedAnalystName || "Definir", null, false, 0));
    } else {
      const isSplit = allocationsForProj.length > 1;
      allocationsForProj.forEach((pa, splitIdx) => {
        rows.push(generateRow(pa.analystName, pa, isSplit, splitIdx));
      });
    }
  });

  return rows.map(r => r.join("\t")).join("\n");
}

