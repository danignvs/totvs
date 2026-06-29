import React, { useState } from "react";
import { 
  ClipboardCopy, Check, AlertTriangle, Users, 
  Layers, Clock, Search, CheckCircle2, Calendar
} from "lucide-react";
import { AllocationResult, Project, Analyst } from "../types";
import { generateProjectCentricMatrixTSV } from "../utils/scheduler";
import { checkHolidayOrWeekend } from "../utils/holidays";

interface ResultsSectionProps {
  result: AllocationResult;
  projects: Project[];
  analysts: Analyst[];
  selectedYear: number;
  selectedMonth: number;
}

// Helper to position Analista between Tarefa and Horas
function getOrderedHeaders(headers: string[]): { header: string; isAnalystColumn: boolean; isOriginal: boolean }[] {
  const normalized = headers.map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
  
  const tarefaIdx = normalized.findIndex(nh => nh.includes("tarefa") || nh.includes("task") || nh.includes("demanda") || nh.includes("atividade"));
  const analystIdx = normalized.findIndex(nh => nh.includes("analista") || nh.includes("analyst") || nh.includes("responsavel") || nh.includes("membro"));
  
  const resultHeaders: { header: string; isAnalystColumn: boolean; isOriginal: boolean }[] = [];
  
  headers.forEach((h, idx) => {
    if (idx === analystIdx) return; // Skip original analyst column to insert specifically
    if (idx === tarefaIdx) {
      resultHeaders.push({ header: h, isAnalystColumn: false, isOriginal: true });
      // Inject Analista right after Tarefa
      const analystHeader = analystIdx !== -1 ? headers[analystIdx] : "Analista";
      resultHeaders.push({ header: analystHeader, isAnalystColumn: true, isOriginal: analystIdx !== -1 });
    } else {
      resultHeaders.push({ header: h, isAnalystColumn: false, isOriginal: true });
    }
  });
  
  // Fallback if Tarefa column is missing, ensure Analista is present
  const hasAnalyst = resultHeaders.some(rh => rh.isAnalystColumn);
  if (!hasAnalyst) {
    const targetPos = Math.max(0, resultHeaders.length - 1);
    resultHeaders.splice(targetPos, 0, { header: "Analista", isAnalystColumn: true, isOriginal: false });
  }
  
  return resultHeaders;
}

export default function ResultsSection({ 
  result, 
  projects, 
  analysts, 
  selectedYear, 
  selectedMonth 
}: ResultsSectionProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAnalyst, setFilterAnalyst] = useState("");

  const totalAllocatedHours = result.projectAllocations.reduce(
    (sum, pa) => sum + pa.allocations.reduce((s, a) => s + a.hours, 0),
    0
  );

  const totalProjectHours = projects.reduce((sum, p) => sum + p.totalHours, 0);
  const unallocatedCount = result.unallocatedProjects.length;

  const handleCopyTSV = () => {
    const tsvContent = generateProjectCentricMatrixTSV(result, projects, selectedYear, selectedMonth);
    navigator.clipboard.writeText(tsvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const pad = (num: number) => num.toString().padStart(2, "0");
  const maxDays = new Date(selectedYear, selectedMonth, 0).getDate();

  // Get original CSV headers or default ones
  const firstProject = projects[0];
  const originalHeaders = firstProject?.originalHeaders || ["Código", "Projeto", "Tarefa", "Horas", "Analista"];
  const orderedHeaders = getOrderedHeaders(originalHeaders);

  // Find the exact index of "Total" column if it exists in the original CSV
  let totalColIdx = originalHeaders.findIndex(h => {
    const nh = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return nh === "total" || nh === "total alocado" || nh.includes("total");
  });

  // Unique analysts list from results for filtering
  const uniqueAnalysts = Array.from(new Set(
    result.projectAllocations.map(pa => pa.analystName.trim())
      .concat(projects.map(p => p.assignedAnalystName?.trim() || ""))
      .filter(name => !!name && name !== "" && name.toLowerCase() !== "definir")
  )).sort();

  // Filter projects according to search term and analyst filter
  const filteredProjects = projects.filter(project => {
    const term = searchTerm.toLowerCase();
    
    const matchesSearch = project.rawRow
      ? Object.values(project.rawRow).some(v => v.toLowerCase().includes(term))
      : project.name.toLowerCase().includes(term);

    // Get assigned/allocated analyst for this project
    const pa = result.projectAllocations.find(a => a.projectId === project.id);
    const actualAnalyst = pa ? pa.analystName : (project.assignedAnalystName || "Definir");

    const matchesAnalyst = filterAnalyst === "" || 
      actualAnalyst.toLowerCase().trim() === filterAnalyst.toLowerCase().trim();

    return matchesSearch && matchesAnalyst;
  });

  return (
    <div id="results-panel" className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 mb-8">
      {/* Header and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 font-display">
            <CheckCircle2 className="w-5 h-5 text-indigo-600" />
            Resultado
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição detalhada das demandas no mês de <strong className="text-indigo-600 font-semibold">{pad(selectedMonth)}/{selectedYear}</strong> baseada nos parâmetros e disponibilidade de dias úteis.
          </p>
        </div>

        <button
          onClick={handleCopyTSV}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Copiado com Sucesso!</span>
            </>
          ) : (
            <>
              <ClipboardCopy className="w-4 h-4" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">Total Demandas</span>
            <span className="text-lg font-extrabold text-slate-900 mt-1 block">{projects.length}</span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
          <div className="p-2 bg-sky-50 text-sky-600 rounded-lg shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">Analistas Ativos</span>
            <span className="text-lg font-extrabold text-slate-900 mt-1 block">{uniqueAnalysts.length}</span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">Horas Alocadas</span>
            <span className="text-lg font-extrabold text-slate-900 mt-1 block leading-tight">
              {totalAllocatedHours.toString().replace(".", ",")}h
              <span className="text-[10px] font-normal text-slate-500 block leading-none mt-0.5">
                de {totalProjectHours.toString().replace(".", ",")}h solicitadas
              </span>
            </span>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-start gap-3 relative group ${
          unallocatedCount > 0 ? "bg-amber-50/50 border-amber-150 cursor-help" : "bg-slate-50 border-slate-100"
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            unallocatedCount > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"
          }`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">Tarefas Pendentes</span>
            <span className={`text-lg font-extrabold mt-1 block ${unallocatedCount > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {unallocatedCount} {unallocatedCount === 1 ? "demanda" : "demandas"}
            </span>
          </div>

          {unallocatedCount > 0 && (
            <div className="absolute top-full mt-2 right-0 w-80 bg-slate-900 text-white text-[10px] rounded-lg p-3 whitespace-normal z-50 shadow-lg hidden group-hover:block leading-relaxed border border-slate-700 pointer-events-none">
              <strong className="block text-amber-400 font-semibold mb-1.5 border-b border-slate-700 pb-1 uppercase tracking-wider text-[9px]">
                Demandas com Pendências:
              </strong>
              <div className="max-h-48 overflow-y-auto space-y-2.5 divide-y divide-slate-800">
                {result.unallocatedProjects.map((item, idx) => (
                  <div key={item.project.id} className={idx > 0 ? "pt-2" : ""}>
                    <span className="font-bold text-slate-200 block truncate" title={item.project.name}>
                      {item.project.name}
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Pendente: {item.remainingHours.toString().replace(".", ",")}h de {item.project.totalHours.toString().replace(".", ",")}h
                    </span>
                    <span className="text-[9px] text-amber-300 block mt-0.5 font-medium">
                      Motivo: {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar por projeto, código, tarefa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-150 focus:border-indigo-500 transition"
          />
        </div>
        
        <select
          value={filterAnalyst}
          onChange={(e) => setFilterAnalyst(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-150 focus:border-indigo-500 transition bg-white text-slate-700 min-w-[180px] cursor-pointer font-medium"
        >
          <option value="">Todos os Analistas</option>
          {uniqueAnalysts.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Single Unified Grid Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              {/* Category Grouping Header Row */}
              <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th colSpan={orderedHeaders.length} className="py-2.5 px-4 text-center border-r border-slate-200 bg-slate-100 text-slate-800 font-semibold">
                  Metadados do CSV Original
                </th>
                <th colSpan={maxDays} className="py-2.5 px-4 text-center border-r border-slate-200 bg-indigo-50/80 text-indigo-900 font-semibold">
                  Distribuição Diária ({pad(selectedMonth)}/{selectedYear})
                </th>
                <th className="py-2.5 px-4 text-center text-emerald-900 bg-emerald-50/80 font-semibold">
                  Alocação
                </th>
              </tr>

              {/* Exact Column headers */}
              <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase border-b border-slate-200">
                {/* 1. Original headers */}
                {orderedHeaders.map((oh, idx) => (
                  <th key={`orig-${idx}`} className="py-2.5 px-4 border-r border-slate-200 font-bold text-slate-700 whitespace-nowrap">
                    {oh.header}
                  </th>
                ))}

                {/* 2. Days of the Month */}
                {Array.from({ length: maxDays }).map((_, dIdx) => {
                  const dayNum = dIdx + 1;
                  const dateObj = new Date(selectedYear, selectedMonth - 1, dayNum);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  const holidayCheck = checkHolidayOrWeekend(dateObj);

                  let bgClass = "bg-indigo-50/20";
                  let titleStr = `Dia ${dayNum}`;
                  if (isWeekend) {
                    bgClass = "bg-red-50/60 text-red-600 font-semibold";
                    titleStr = `Dia ${dayNum} - Fim de Semana`;
                  }
                  if (holidayCheck.isHoliday) {
                    bgClass = "bg-rose-100 text-rose-700 font-semibold";
                    titleStr = `Dia ${dayNum} - Feriado: ${holidayCheck.reason}`;
                  }

                  return (
                    <th 
                      key={`day-${dayNum}`} 
                      className={`py-2 px-1 text-center text-xs border-r border-slate-200 font-mono last:border-r-0 ${bgClass}`}
                      title={titleStr}
                    >
                      {dayNum}
                    </th>
                  );
                })}

                {/* 3. Total column */}
                <th className="py-2.5 px-4 text-center text-emerald-800 bg-emerald-50 font-bold whitespace-nowrap">
                  Total Alocado
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-150 text-slate-700 text-xs">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={orderedHeaders.length + maxDays + 1} className="py-12 text-center text-slate-400 font-medium">
                    Nenhum projeto ou demanda encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredProjects.flatMap(project => {
                  const allocationsForProj = result.projectAllocations.filter(
                    pa => pa.projectId === project.id
                  );
                  if (allocationsForProj.length === 0) {
                    return [{ project, pa: null, isSplit: false, splitIdx: 0 }];
                  } else {
                    const isSplit = allocationsForProj.length > 1;
                    return allocationsForProj.map((pa, idx) => ({ project, pa, isSplit, splitIdx: idx }));
                  }
                }).map((item, rowIdx) => {
                  const { project, pa, isSplit, splitIdx } = item;
                  
                  const allocationsMap: Record<string, number> = {};
                  let totalAllocated = 0; // Total for this specific row/analyst

                  if (pa) {
                    pa.allocations.forEach(alloc => {
                      allocationsMap[alloc.date] = (allocationsMap[alloc.date] || 0) + alloc.hours;
                      totalAllocated += alloc.hours;
                    });
                  }

                  // Compute total allocated across ALL analysts for this project to determine if it's fully allocated overall
                  const allProjectAllocations = result.projectAllocations.filter(p => p.projectId === project.id);
                  let projectTotalAllocated = 0;
                  allProjectAllocations.forEach(p => {
                    p.allocations.forEach(a => {
                      projectTotalAllocated += a.hours;
                    });
                  });

                  const isFullyAllocated = projectTotalAllocated >= project.totalHours;

                  return (
                    <tr 
                      key={`${project.id}-${rowIdx}`} 
                      className="hover:bg-indigo-100/70 transition-colors odd:bg-slate-50/10"
                    >
                      {/* 1. Render original CSV metadata columns */}
                      {orderedHeaders.map((oh, colIdx) => {
                        let cellVal = "";
                        if (oh.isAnalystColumn) {
                          cellVal = pa ? pa.analystName : (project.assignedAnalystName || "Definir");
                        } else {
                          cellVal = project.rawRow ? (project.rawRow[oh.header] || "") : "";
                          const normHeader = oh.header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                          if (isSplit && (normHeader === "tarefa" || normHeader === "nome da tarefa" || normHeader === "nome do projeto" || normHeader === "projeto")) {
                            if (cellVal) cellVal += ` (${splitIdx + 1})`;
                          }
                        }

                        return (
                          <td 
                            key={`val-${colIdx}`} 
                            className="py-2 px-4 border-r border-slate-150 font-medium text-slate-800 whitespace-nowrap max-w-[220px] truncate"
                            title={cellVal}
                          >
                            {cellVal}
                          </td>
                        );
                      })}

                      {/* 2. Render daily hour columns */}
                      {Array.from({ length: maxDays }).map((_, dIdx) => {
                        const dayNum = dIdx + 1;
                        const dateKey = `${selectedYear}-${pad(selectedMonth)}-${pad(dayNum)}`;
                        const hours = allocationsMap[dateKey];

                        const dateObj = new Date(selectedYear, selectedMonth - 1, dayNum);
                        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                        const holidayCheck = checkHolidayOrWeekend(dateObj);

                        if (holidayCheck.isHoliday) {
                          return (
                            <td 
                              key={`cell-day-${dayNum}`} 
                              className="py-2 px-1 bg-rose-50/30 text-center border-r border-slate-150 text-[10px] text-rose-500/60 font-bold select-none"
                              title={`${holidayCheck.reason} - Alocação Proibida`}
                            >
                              F
                            </td>
                          );
                        }

                        if (isWeekend) {
                          return (
                            <td 
                              key={`cell-day-${dayNum}`} 
                              className="py-2 px-1 bg-red-50/10 text-center border-r border-slate-150 text-[10px] text-red-400 select-none"
                            >
                              -
                            </td>
                          );
                        }

                        if (hours && hours > 0) {
                          return (
                            <td 
                              key={`cell-day-${dayNum}`} 
                              className="py-2 px-1 border-r border-slate-150 text-center font-mono font-bold text-xs bg-indigo-50/50 text-indigo-700"
                            >
                              {hours.toString().replace(".", ",")}
                            </td>
                          );
                        }

                        return (
                          <td 
                            key={`cell-day-${dayNum}`} 
                            className="py-2 px-1 text-center border-r border-slate-150 text-slate-300 font-mono"
                          >
                            -
                          </td>
                        );
                      })}

                      {/* 3. Render Total hours column with rich hover explanations */}
                      <td className="py-2 px-4 text-center font-extrabold font-mono bg-emerald-50/10 whitespace-nowrap border-r border-slate-200 relative group">
                        <span className={`${isFullyAllocated ? "text-emerald-600" : totalAllocated > 0 ? "text-amber-600 cursor-help" : "text-rose-500 cursor-help"} hover:underline`}>
                          {totalAllocated.toString().replace(".", ",")}
                        </span>
                        <span className="text-slate-400 font-normal text-[10px]"> / {project.totalHours.toString().replace(".", ",")}</span>

                        {!isFullyAllocated && (
                          <span className="absolute bottom-full mb-1.5 right-4 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded px-2.5 py-1.5 whitespace-normal z-50 shadow-md max-w-[240px] leading-snug font-sans text-left border border-slate-700 pointer-events-none">
                            {projectTotalAllocated > 0 ? (
                              <span>
                                <strong className="text-amber-400 block font-semibold mb-0.5">Alocação Parcial da Demanda:</strong>
                                Foram distribuídas {projectTotalAllocated.toString().replace(".", ",")}h das {project.totalHours.toString().replace(".", ",")}h necessárias da demanda (somando todos os analistas). Motivo: Limite de horas dos analistas compatíveis atingido no período.
                              </span>
                            ) : (
                              <span>
                                <strong className="text-rose-400 block font-semibold mb-0.5">Pendente / Não Alocado:</strong>
                                Motivo: {result.unallocatedProjects.find(un => un.project.id === project.id)?.reason || "Nenhuma hora disponível de analistas qualificados com as competências necessárias."}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-3 italic leading-relaxed">
        Nota: A grade de resultados preserva e complementa com fidelidade absoluta a estrutura original do CSV. Finais de semana (-) e feriados nacionais, estaduais ou municipais do Rio de Janeiro (F) são identificados visualmente com cores específicas para auditoria. Você pode copiar e colar diretamente no Google Sheets.
      </p>
    </div>
  );
}
