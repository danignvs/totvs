import { Analyst, Project } from "../types";
import { checkHolidayOrWeekend, formatDateKey } from "./holidays";

/**
 * Normalizes column separators. If the text has no tabs, semicolons, or commas, but contains 
 * consecutive spaces (2 or more), we convert them to tabs to treat it as a tab-separated spreadsheet format.
 */
export function preprocessTextSeparators(text: string): string {
  if (!text) return "";
  // Check if we should convert multi-spaces to tabs (helpful for space-padded tables)
  if (!text.includes('\t') && !text.includes(';') && text.includes('  ')) {
    // If commas are present, they might be decimals like "18,5" or actual list separators.
    // If there's a header like Código   Projeto   Tarefa   Horas, it's safer to treat double spaces as tab.
    return text.replace(/ {2,}/g, '\t');
  }
  return text;
}

/**
 * Auto-detects the delimiter in a CSV string.
 * Supports semicolon (;), comma (,), and tab (\t), prioritizing based on structure consistency.
 */
export function detectDelimiter(text: string): string {
  // If tab is present, prioritize it since spreadsheet copy-pastes use tab
  if (text.includes('\t')) {
    return '\t';
  }

  const delimiters = [';', ','];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 5);
  
  if (lines.length === 0) return ',';

  let bestDelimiter = ';';
  let bestScore = -1;

  for (const delim of delimiters) {
    const colCounts = lines.map(line => {
      let count = 0;
      let insideQuote = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') insideQuote = !insideQuote;
        else if (line[i] === delim && !insideQuote) count++;
      }
      return count + 1;
    });

    const avgCols = colCounts.reduce((a, b) => a + b, 0) / colCounts.length;
    
    // If average columns is 1, this delimiter didn't separate any columns in the lines
    if (avgCols <= 1) continue;

    // Calculate variance to measure column consistency across rows
    const variance = colCounts.reduce((sum, c) => sum + Math.pow(c - avgCols, 2), 0) / colCounts.length;
    
    // Score prioritizes more columns with higher consistency (lower variance)
    const score = avgCols - variance;
    
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Splitting utility that respects double quotes for embedded delimiters or linebreaks.
 */
export function parseCSVRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      insideQuote = !insideQuote;
      // Do not append the quote character itself
    } else if (char === delimiter && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip the '\n'
      }
      rows.push(row.map(cell => cell.trim()));
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }

  if (row.length > 1 || row[0] !== "") {
    rows.push(row.map(cell => cell.trim()));
  }

  return rows.filter(r => r.some(cell => cell !== ""));
}

/**
 * Attempts to parse a string into a Date. Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 */
export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  
  // If it is just a plain day number (1-31), do NOT parse it as a full date
  if (/^\d{1,2}$/.test(clean)) {
    return null;
  }
  
  // Try YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    return new Date(y, m, d);
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const brMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (brMatch) {
    const d = parseInt(brMatch[1], 10);
    const m = parseInt(brMatch[2], 10) - 1;
    let y = parseInt(brMatch[3], 10);
    if (y < 100) {
      y += y < 50 ? 2000 : 1900; // Pivot for 2-digit years
    }
    return new Date(y, m, d);
  }

  const timestamp = Date.parse(clean);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
}

/**
 * Normalizes number string, converting Portuguese decimals (e.g. "8,5") to standard float.
 */
export function parseFlexibleNumber(numStr: string): number {
  if (!numStr) return 0;
  const clean = numStr.replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes list of comma-separated items.
 */
export function parseSkillsList(skillsStr: string): string[] {
  if (!skillsStr) return [];
  return skillsStr
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Checks if a string is a date format.
 */
export function isDateString(str: string): boolean {
  return parseFlexibleDate(str) !== null;
}

function parseHeaderAsDate(header: string, year: number, month: number): Date | null {
  const cleanHeader = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  // Try matching day pattern (e.g. "dia 1", "dia1", "d1", "1", "01") first to avoid Date.parse greediness
  const matchDia = cleanHeader.match(/^(?:seg|ter|qua|qui|sex|sab|dom|mon|tue|wed|thu|fri|sat|sun|dia|day|d|segunda|terca|quarta|quinta|sexta|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[\s\-_/]*(\d{1,2})$/);
  if (matchDia) {
    const day = parseInt(matchDia[1], 10);
    if (day >= 1 && day <= 31) {
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day <= daysInMonth) {
        return new Date(year, month - 1, day);
      }
    }
  }

  // Fallback to full flexible dates (e.g. "17/04/2026", "2026-04-17")
  const directDate = parseFlexibleDate(header);
  if (directDate) return directDate;

  return null;
}

/**
 * Parses the Analysts CSV file.
 * Returns the parsed analysts list and a list of warnings (e.g. skipped weekend hours).
 */
export function parseAnalystsCSV(
  text: string,
  targetYear?: number,
  targetMonth?: number,
  csvType: "availability" | "allocated" = "allocated",
  standardCapacity: number = 8
): { analysts: Analyst[]; warnings: string[] } {
  const normalizedText = preprocessTextSeparators(text);
  const defaultYear = targetYear || 2026;
  const defaultMonth = targetMonth || 4;
  const daysInMonth = new Date(defaultYear, defaultMonth, 0).getDate();
  const pad = (num: number) => num.toString().padStart(2, "0");

  const delimiter = detectDelimiter(normalizedText);
  const rows = parseCSVRows(normalizedText, delimiter);
  const warnings: string[] = [];

  if (rows.length < 2) {
    throw new Error("O conteúdo de analistas deve conter um cabeçalho e pelo menos uma linha de dados.");
  }

  const headers = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());

  // Detect format: Matrix versus Row-Based
  const dateColumns: { colIndex: number; dateStr: string; dateObj: Date }[] = [];
  
  headers.forEach((h, idx) => {
    const parsedDate = parseHeaderAsDate(h, defaultYear, defaultMonth);
    if (parsedDate) {
      dateColumns.push({ colIndex: idx, dateStr: h, dateObj: parsedDate });
    }
  });

  const analystsMap: { [name: string]: Analyst } = {};

  const initAnalyst = (name: string, competencies: string[]): Analyst => {
    if (!analystsMap[name]) {
      const analyst: Analyst = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        competencies: [...competencies],
        availability: {},
        allocatedHours: {}
      };
      
      // Initialize all days of the month
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(defaultYear, defaultMonth - 1, d);
        const dateKey = `${defaultYear}-${pad(defaultMonth)}-${pad(d)}`;
        const dateCheck = checkHolidayOrWeekend(dateObj);
        
        analyst.allocatedHours[dateKey] = 0;
        analyst.availability[dateKey] = dateCheck.isHoliday ? 0 : 8;
      }
      analystsMap[name] = analyst;
    } else {
      // Merge competencies
      competencies.forEach(c => {
        if (!analystsMap[name].competencies.includes(c)) {
          analystsMap[name].competencies.push(c);
        }
      });
    }
    return analystsMap[name];
  };

  if (dateColumns.length > 0) {
    // MATRIX FORMAT
    const analistaColIdx = headers.findIndex(h => h.includes("analista") || h.includes("nome") || h.includes("name"));
    const competColIdx = headers.findIndex(h => h.includes("competencia") || h.includes("skill") || h.includes("requisito"));

    const finalAnalistaIdx = analistaColIdx !== -1 ? analistaColIdx : 0;
    const isCol1Date = dateColumns.some(dc => dc.colIndex === 1);
    const finalCompetIdx = competColIdx !== -1 ? competColIdx : (isCol1Date ? -1 : 1);

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length <= finalAnalistaIdx) continue;

      const name = row[finalAnalistaIdx]?.trim();
      if (!name) continue;

      const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (normalizedName.includes("calendario")) continue;

      const competenciesStr = (finalCompetIdx !== -1 && finalCompetIdx < row.length) ? row[finalCompetIdx] : "";
      const competencies = parseSkillsList(competenciesStr);

      const analyst = initAnalyst(name, competencies);

      // Parse hours for each date column
      for (const dateCol of dateColumns) {
        const rawHours = dateCol.colIndex < row.length ? row[dateCol.colIndex] : "";
        let hours = parseFlexibleNumber(rawHours);
        if (hours > 23.9) {
          hours = 24;
        }
        const dateCheck = checkHolidayOrWeekend(dateCol.dateObj);
        const dateKey = formatDateKey(dateCol.dateObj);

        analyst.allocatedHours![dateKey] = hours;

        if (hours === 24) {
          analyst.availability[dateKey] = 0;
        } else if (dateCheck.isHoliday) {
          analyst.availability[dateKey] = 0;
          if (hours > 0) {
            warnings.push(
              `Horas descartadas para ${name} no dia ${dateCol.dateStr} (${dateCheck.reason}) - Alocação proibida.`
            );
          }
        } else {
          analyst.availability[dateKey] = Math.max(0, 8 - hours);
        }
      }
    }
  } else {
    // ROW-BASED FORMAT
    const analistaColIdx = headers.findIndex(h => h.includes("analista") || h.includes("nome") || h.includes("name"));
    const competColIdx = headers.findIndex(h => h.includes("competencia") || h.includes("skill") || h.includes("requisito"));
    const dataColIdx = headers.findIndex(h => h.includes("data") || h.includes("date") || h.includes("dia"));
    const horasColIdx = headers.findIndex(h => h.includes("hora") || h.includes("hour") || h.includes("disponib") || h.includes("aloc"));

    if (analistaColIdx === -1 || dataColIdx === -1 || horasColIdx === -1) {
      throw new Error(
        "Formato de linha inválido. Certifique-se de que o texto possui colunas de nome, data e horas."
      );
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length <= Math.max(analistaColIdx, dataColIdx, horasColIdx)) continue;

      const name = row[analistaColIdx]?.trim();
      if (!name) continue;

      const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (normalizedName.includes("calendario")) continue;

      const competenciesStr = competColIdx !== -1 ? row[competColIdx] : "";
      const competencies = parseSkillsList(competenciesStr);

      const rawDate = row[dataColIdx];
      const parsedDate = parseFlexibleDate(rawDate);

      const rawHours = row[horasColIdx];
      let hours = parseFlexibleNumber(rawHours);
      if (hours > 23.9) {
        hours = 24;
      }

      if (!parsedDate) {
        warnings.push(`Linha ${r + 1}: Data inválida '${rawDate}' ignorada.`);
        continue;
      }

      const analyst = initAnalyst(name, competencies);

      const dateCheck = checkHolidayOrWeekend(parsedDate);
      const dateKey = formatDateKey(parsedDate);

      analyst.allocatedHours![dateKey] = hours;

      if (hours === 24) {
        analyst.availability[dateKey] = 0;
      } else if (dateCheck.isHoliday) {
        analyst.availability[dateKey] = 0;
        if (hours > 0) {
          warnings.push(
            `Horas descartadas para ${name} no dia ${rawDate} (${dateCheck.reason}) - Alocação proibida.`
          );
        }
      } else {
        analyst.availability[dateKey] = Math.max(0, 8 - hours);
      }
    }
  }

  return {
    analysts: Object.values(analystsMap),
    warnings
  };
}

/**
 * Parses the Projects CSV file.
 * Expected headers: Projeto, Requisitos/Competências, Horas
 */
export function parseProjectsCSV(text: string): { projects: Project[]; warnings: string[] } {
  const normalizedText = preprocessTextSeparators(text);
  const delimiter = detectDelimiter(normalizedText);
  const rows = parseCSVRows(normalizedText, delimiter);
  const warnings: string[] = [];

  if (rows.length < 2) {
    throw new Error("A lista de projetos deve conter um cabeçalho e pelo menos uma linha de dados.");
  }

  // Find actual header row dynamically by searching for row with project/code and hours
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    const normalizedCells = row.map(c => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
    const hasProjeto = normalizedCells.some(c => c === "projeto" || c === "project" || c.includes("nome do projeto") || c === "codigo");
    const hasHoras = normalizedCells.some(c => c === "horas" || c === "hours" || c.includes("total de horas") || c === "tempo");
    if (hasProjeto && hasHoras) {
      headerRowIndex = r;
      break;
    }
  }

  const prefixRows = rows.slice(0, headerRowIndex);
  const originalHeaders = rows[headerRowIndex];
  const headers = originalHeaders.map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());

  const projetoColIdx = headers.findIndex(h => h.includes("projeto") || h.includes("nome") || h.includes("project") || h.includes("name"));
  const competColIdx = headers.findIndex(h => h.includes("competencia") || h.includes("skill") || h.includes("requisito") || h.includes("tecnologia"));
  const horasColIdx = headers.findIndex(h => h.includes("hora") || h.includes("hour") || h.includes("tempo") || h.includes("duracao") || h.includes("esforco"));
  const analistaColIdx = headers.findIndex(h => h.includes("analista") || h.includes("analyst") || h.includes("membro") || h.includes("responsavel"));

  if (projetoColIdx === -1 || horasColIdx === -1) {
    throw new Error(
      "Formato de projetos inválido. Certifique-se de que o CSV possui colunas de 'Projeto' e 'Horas'."
    );
  }

  const projects: Project[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= Math.max(projetoColIdx, horasColIdx)) continue;

    const name = row[projetoColIdx]?.trim();
    if (!name) continue;

    const competenciesStr = competColIdx !== -1 ? row[competColIdx] : "";
    const requiredCompetencies = parseSkillsList(competenciesStr);

    const rawHours = row[horasColIdx];
    const totalHours = parseFlexibleNumber(rawHours);

    if (totalHours <= 0) {
      warnings.push(`Linha ${r + 1}: Projeto '${name}' com horas inválidas ou zeradas foi ignorado.`);
      continue;
    }

    const assignedAnalystName = analistaColIdx !== -1 ? row[analistaColIdx]?.trim() : undefined;

    const rawRow: Record<string, string> = {};
    originalHeaders.forEach((h, idx) => {
      rawRow[h] = row[idx] || "";
    });

    projects.push({
      id: Math.random().toString(36).substr(2, 9),
      name,
      requiredCompetencies,
      totalHours,
      originalHeaders,
      rawRow,
      assignedAnalystName,
      prefixRows,
      headerRowIndex
    });
  }

  return {
    projects,
    warnings
  };
}
