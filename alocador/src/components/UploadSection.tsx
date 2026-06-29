import React, { useState, useEffect, useRef } from "react";
import { 
  Calendar, CheckCircle, AlertCircle, HelpCircle, 
  Eye, RefreshCw, FileText, Settings, Sliders, AlertTriangle, ClipboardCopy
} from "lucide-react";
import { parseAnalystsCSV, parseProjectsCSV } from "../utils/csvParser";
import { checkHolidayOrWeekend } from "../utils/holidays";
import { Analyst } from "../types";
import { 
  NEW_SAMPLE_ANALYSTS_CSV, 
  NEW_SAMPLE_PROJECTS_CSV 
} from "../utils/sampleData";

interface UploadSectionProps {
  onDataLoaded: (data: {
    analystsCsv: string;
    projectsCsv: string;
    matchingStrategy: "any" | "all";
    sortProjectsBy: "largest_hours" | "smallest_hours" | "original";
    year: number;
    month: number;
    analystCsvType: "availability" | "allocated";
    standardCapacity: number;
  }) => void;
  isLoading: boolean;
}

const generateAnalystsCsv = (analysts: Analyst[], year: number, month: number): string => {
  const maxDays = new Date(year, month, 0).getDate();
  const pad = (num: number) => num.toString().padStart(2, "0");

  const headers = ["Analista", "Competências"];
  for (let d = 1; d <= maxDays; d++) {
    headers.push(`Dia ${d}`);
  }
  const lines = [headers.join(",")];

  analysts.forEach(analyst => {
    const compStr = analyst.competencies.join(", ");
    const escapedComp = compStr.includes(",") ? `"${compStr}"` : compStr;

    const row = [analyst.name, escapedComp];
    for (let d = 1; d <= maxDays; d++) {
      const dateKey = `${year}-${pad(month)}-${pad(d)}`;
      const hours = analyst.allocatedHours?.[dateKey] ?? 0;
      row.push(hours.toString());
    }
    lines.push(row.join(","));
  });

  return lines.join("\n");
};

interface EditableCellProps {
  analystId: string;
  dateKey: string;
  reservedHours: number;
  availableHours: number;
  isDeactivated: boolean;
  hasError: boolean;
  errorMessage: string;
  holidayCheck: { isHoliday: boolean; reason: string };
  validationTab: "reservas" | "disponibilidade";
  onUpdateHour: (analystId: string, dateKey: string, hours: number) => void;
}

const EditableCell: React.FC<EditableCellProps> = ({
  analystId,
  dateKey,
  reservedHours,
  availableHours,
  isDeactivated,
  hasError,
  errorMessage,
  holidayCheck,
  validationTab,
  onUpdateHour,
}) => {
  const displayValue = validationTab === "reservas" ? reservedHours : availableHours;
  const [localVal, setLocalVal] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      if (isDeactivated) {
        setLocalVal("24");
      } else if (displayValue === 0) {
        setLocalVal("-");
      } else {
        setLocalVal(displayValue.toString().replace(".", ","));
      }
    }
  }, [displayValue, isDeactivated, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    if (isDeactivated) {
      setLocalVal("24");
    } else if (displayValue === 0) {
      setLocalVal("");
    } else {
      setLocalVal(displayValue.toString().replace(".", ","));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const commitValue = () => {
    const cleaned = localVal.trim().replace(",", ".");
    if (cleaned === "" || cleaned === "-") {
      onUpdateHour(analystId, dateKey, 0);
      return;
    }

    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      if (isDeactivated) {
        setLocalVal("24");
      } else {
        setLocalVal(displayValue === 0 ? "-" : displayValue.toString().replace(".", ","));
      }
      return;
    }

    let newReserved = reservedHours;
    if (validationTab === "reservas") {
      newReserved = num;
    } else {
      if (num === 24 || num > 23.9) {
        newReserved = 24;
      } else {
        newReserved = Math.max(0, 8 - num);
      }
    }

    if (newReserved > 23.9) {
      newReserved = 24;
    }

    onUpdateHour(analystId, dateKey, newReserved);
  };

  let cellStyle = "text-slate-700 font-mono";
  if (isDeactivated) {
    cellStyle = "bg-slate-100 text-slate-400 font-semibold select-none";
  } else if (hasError) {
    cellStyle = "text-red-600 font-bold bg-red-50/80";
  } else if (displayValue > 0) {
    cellStyle = "text-indigo-600 font-semibold font-mono";
  } else {
    cellStyle = "text-slate-300 font-mono";
  }

  return (
    <td 
      className={`p-0 text-center border-r border-slate-200 ${cellStyle} relative group transition-colors min-w-0`}
    >
      <input
        type="text"
        value={localVal}
        onFocus={(e) => {
          handleFocus();
          const target = e.currentTarget;
          setTimeout(() => {
            target.select();
          }, 0);
        }}
        onClick={(e) => {
          e.currentTarget.select();
        }}
        onBlur={handleBlur}
        onChange={(e) => setLocalVal(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full h-6 text-center bg-transparent border-0 outline-none text-[8px] xs:text-[9px] sm:text-[10px] md:text-[11px] font-mono focus:bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 transition-all rounded-sm p-0 select-all"
      />

      {/* Hover Tooltip */}
      {isDeactivated && (
        <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap z-50 shadow-md">
          Dia Desativado (Sem disponibilidade)
        </span>
      )}
      {hasError && (
        <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap z-50 shadow-md">
          {errorMessage}
        </span>
      )}
      {!hasError && !isDeactivated && holidayCheck.isHoliday && (
        <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap z-50 shadow-md">
          {holidayCheck.reason} (Sem expediente)
        </span>
      )}
    </td>
  );
};

export default function UploadSection({ onDataLoaded, isLoading }: UploadSectionProps) {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1); // Default to current month
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear()); // Default to current year

  const [analystsCsv, setAnalystsCsv] = useState(NEW_SAMPLE_ANALYSTS_CSV);
  const [projectsCsv, setProjectsCsv] = useState(NEW_SAMPLE_PROJECTS_CSV);

  const [pasteErrorAnalysts, setPasteErrorAnalysts] = useState<string | null>(null);
  const [pasteErrorProjects, setPasteErrorProjects] = useState<string | null>(null);

  const analystsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const projectsTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [matchingStrategy, setMatchingStrategy] = useState<"any" | "all">("all");
  const [sortProjectsBy, setSortProjectsBy] = useState<"largest_hours" | "smallest_hours" | "original">("original");

  // Visual validation tab: "reservas" or "disponibilidade"
  const [validationTab, setValidationTab] = useState<"reservas" | "disponibilidade">("reservas");

  // Real-time parsing state
  const [parsedAnalysts, setParsedAnalysts] = useState<Analyst[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Update parsed analysts in real-time
  useEffect(() => {
    if (!analystsCsv.trim()) {
      setParsedAnalysts([]);
      setParseError(null);
      setParseWarnings([]);
      return;
    }
    try {
      const { analysts, warnings } = parseAnalystsCSV(analystsCsv, selectedYear, selectedMonth, "allocated", 8);
      setParsedAnalysts(analysts);
      setParseError(null);
      setParseWarnings(warnings);
    } catch (err: any) {
      setParseError(err.message || "Erro de formatação.");
      setParsedAnalysts([]);
    }
  }, [analystsCsv, selectedYear, selectedMonth]);

  const handleUpdateHour = (analystId: string, dateKey: string, hours: number) => {
    const updatedAnalysts = parsedAnalysts.map(analyst => {
      if (analyst.id !== analystId) return analyst;

      let normalizedHours = hours;
      if (normalizedHours > 23.9) {
        normalizedHours = 24;
      }

      const updatedAllocatedHours = {
        ...analyst.allocatedHours,
        [dateKey]: normalizedHours
      };

      const dateObj = new Date(selectedYear, selectedMonth - 1, parseInt(dateKey.split("-")[2], 10));
      const holidayCheck = checkHolidayOrWeekend(dateObj);
      
      const updatedAvailability = { ...analyst.availability };
      if (normalizedHours === 24) {
        updatedAvailability[dateKey] = 0;
      } else if (holidayCheck.isHoliday) {
        updatedAvailability[dateKey] = 0;
      } else {
        updatedAvailability[dateKey] = Math.max(0, 8 - normalizedHours);
      }

      return {
        ...analyst,
        allocatedHours: updatedAllocatedHours,
        availability: updatedAvailability
      };
    });

    setParsedAnalysts(updatedAnalysts);

    // Sync back to raw CSV to persist state when allocating
    const newCsvStr = generateAnalystsCsv(updatedAnalysts, selectedYear, selectedMonth);
    setAnalystsCsv(newCsvStr);
  };

  const handleLoadSample = () => {
    setAnalystsCsv(NEW_SAMPLE_ANALYSTS_CSV);
  };

  const handleLoadSampleProjects = () => {
    setProjectsCsv(NEW_SAMPLE_PROJECTS_CSV);
  };

  const handleAllocate = () => {
    onDataLoaded({
      analystsCsv,
      projectsCsv,
      matchingStrategy,
      sortProjectsBy,
      year: selectedYear,
      month: selectedMonth,
      analystCsvType: "allocated",
      standardCapacity: 8
    });

    // Scroll smoothly to results panel
    setTimeout(() => {
      document.getElementById("results-panel")?.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  const pad = (num: number) => num.toString().padStart(2, "0");
  const maxDays = new Date(selectedYear, selectedMonth, 0).getDate();

  return (
    <div className="space-y-6">
      {/* Month and Year Selection Panel */}
      <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-5">
        <h3 className="font-semibold text-slate-900 text-sm font-display flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          Período do Planejamento
        </h3>
        <p className="text-[11px] text-slate-500 mb-4">
          Selecione o mês e o ano para distribuição de horas e validação de disponibilidade.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Mês:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition bg-white text-slate-700 cursor-pointer"
            >
              <option value={1}>Janeiro</option>
              <option value={2}>Fevereiro</option>
              <option value={3}>Março</option>
              <option value={4}>Abril</option>
              <option value={5}>Maio</option>
              <option value={6}>Junho</option>
              <option value={7}>Julho</option>
              <option value={8}>Agosto</option>
              <option value={9}>Setembro</option>
              <option value={10}>Outubro</option>
              <option value={11}>Novembro</option>
              <option value={12}>Dezembro</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Ano:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition bg-white text-slate-700 cursor-pointer"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2028}>2028</option>
              <option value={2029}>2029</option>
              <option value={2030}>2030</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input 1: Analyst Reservations Text Area */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all hover:border-slate-300">
          <div className="flex items-start justify-between mb-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            {parsedAnalysts.length > 0 ? (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100">
                <CheckCircle className="w-3 h-3" />
                {parsedAnalysts.length} Analistas Carregados
              </span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-100">
                <AlertCircle className="w-3 h-3" />
                Aguardando Dados
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-slate-900 mb-1 font-display">1. Reservas de Horas dos Analistas (Agenda Atual)</h3>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-slate-500">
              Cole o CSV com a agenda dos analistas
            </p>
            <button
              type="button"
              onClick={async () => {
                setAnalystsCsv("");
                if (analystsTextareaRef.current) {
                  analystsTextareaRef.current.focus();
                }
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && text.trim()) {
                    setAnalystsCsv(text);
                    setPasteErrorAnalysts(null);
                  } else {
                    setPasteErrorAnalysts("Área de transferência vazia. Por favor, pressione Ctrl+V para colar.");
                    setTimeout(() => setPasteErrorAnalysts(null), 5000);
                  }
                } catch (err) {
                  setPasteErrorAnalysts("Acesso à área de transferência restrito pelo navegador. Mas a caixa já foi limpa e focada! Pressione Ctrl+V para colar.");
                  setTimeout(() => setPasteErrorAnalysts(null), 6000);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded shadow-2xs transition cursor-pointer"
            >
              <ClipboardCopy className="w-3 h-3" />
              Colar
            </button>
          </div>

          <textarea
            ref={analystsTextareaRef}
            value={analystsCsv}
            onChange={(e) => setAnalystsCsv(e.target.value)}
            onFocus={(e) => {
              const target = e.currentTarget;
              setTimeout(() => {
                target.select();
              }, 0);
            }}
            placeholder="Cole o CSV ou a tabela aqui..."
            className="w-full h-44 p-3 border border-slate-200 rounded-lg text-[11px] font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition outline-none resize-y"
          />

          {pasteErrorAnalysts && (
            <p className="mt-1 text-[10px] text-amber-600 font-medium">{pasteErrorAnalysts}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-2.5 py-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition cursor-pointer"
            >
              Carregar Exemplo
            </button>
          </div>

          {parseError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Input 2: Project Demands Text Area */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 transition-all hover:border-slate-300">
          <div className="flex items-start justify-between mb-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            {projectsCsv.trim().split("\n").length > 1 ? (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-100">
                <CheckCircle className="w-3 h-3" />
                Dados de Projetos Preenchidos
              </span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-100">
                <AlertCircle className="w-3 h-3" />
                Aguardando Dados
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-slate-900 mb-1 font-display">2. Lista de Projetos e Demandas de Horas</h3>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-slate-500">
              Cole a lista de projetos a serem planejados.
            </p>
            <button
              type="button"
              onClick={async () => {
                setProjectsCsv("");
                if (projectsTextareaRef.current) {
                  projectsTextareaRef.current.focus();
                }
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && text.trim()) {
                    setProjectsCsv(text);
                    setPasteErrorProjects(null);
                  } else {
                    setPasteErrorProjects("Área de transferência vazia. Por favor, pressione Ctrl+V para colar.");
                    setTimeout(() => setPasteErrorProjects(null), 5000);
                  }
                } catch (err) {
                  setPasteErrorProjects("Acesso à área de transferência restrito pelo navegador. Mas a caixa já foi limpa e focada! Pressione Ctrl+V para colar.");
                  setTimeout(() => setPasteErrorProjects(null), 6000);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded shadow-2xs transition cursor-pointer"
            >
              <ClipboardCopy className="w-3 h-3" />
              Colar
            </button>
          </div>

          <textarea
            ref={projectsTextareaRef}
            value={projectsCsv}
            onChange={(e) => setProjectsCsv(e.target.value)}
            onFocus={(e) => {
              const target = e.currentTarget;
              setTimeout(() => {
                target.select();
              }, 0);
            }}
            placeholder="Cole a lista de demandas aqui..."
            className="w-full h-44 p-3 border border-slate-200 rounded-lg text-[11px] font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition outline-none resize-y"
          />

          {pasteErrorProjects && (
            <p className="mt-1 text-[10px] text-amber-600 font-medium">{pasteErrorProjects}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadSampleProjects}
              className="px-2.5 py-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition cursor-pointer"
            >
              Carregar Exemplo
            </button>
          </div>
        </div>
      </div>
         {/* Visual Validation Tables (Two options: Hours Reserved vs Available Hours) */}
      {parsedAnalysts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Visualização e Validação dos Analistas
              </h4>
              <p className="text-[10px] text-slate-500">
                Verifique as horas nos dias do mês de {pad(selectedMonth)}/{selectedYear} para auditoria imediata.
              </p>
            </div>
            
            {/* Visual choice toggle switch style */}
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modo:</span>
              <button
                type="button"
                onClick={() => setValidationTab(prev => prev === "reservas" ? "disponibilidade" : "reservas")}
                className="relative inline-flex items-center h-6 w-32 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-200 select-none"
                title="Clique para alternar entre Horas Reservadas e Disponibilidade"
              >
                <span
                  className={`pointer-events-none inline-flex items-center justify-center h-5 w-[60px] transform rounded-full bg-white text-[9px] font-extrabold text-indigo-700 shadow-sm ring-0 transition duration-200 ease-in-out ${
                    validationTab === "reservas" ? "translate-x-0" : "translate-x-[64px]"
                  }`}
                >
                  {validationTab === "reservas" ? "Reservas" : "Disponível"}
                </span>
                <span 
                  className={`absolute inset-y-0 flex items-center text-[9px] font-bold transition duration-200 ${
                    validationTab === "reservas" 
                      ? "right-2 text-slate-400" 
                      : "left-2 text-slate-400"
                  }`}
                >
                  {validationTab === "reservas" ? "Disponível" : "Reservas"}
                </span>
              </button>
            </div>
          </div>

          {/* Validation Grid */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="w-full overflow-hidden">
              <table className="w-full text-left border-collapse table-fixed text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px]">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "7%" }} />
                  {Array.from({ length: maxDays }).map((_, idx) => {
                    const dayWidth = 80 / maxDays;
                    return <col key={`col-${idx}`} style={{ width: `${dayWidth}%` }} />;
                  })}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[8px] sm:text-[9px] tracking-wider">
                    <th className="py-1 px-1 border-r border-slate-200 truncate font-bold text-slate-700">Analista</th>
                    <th className="py-1 px-1 border-r border-slate-200 text-center truncate font-bold text-slate-700">Total</th>
                    {Array.from({ length: maxDays }).map((_, idx) => {
                      const dayNum = idx + 1;
                      const dateObj = new Date(selectedYear, selectedMonth - 1, dayNum);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                      const holidayCheck = checkHolidayOrWeekend(dateObj);
                      
                      let bgClass = "bg-slate-50";
                      let titleStr = `Dia ${dayNum}`;
                      if (isWeekend) {
                        bgClass = "bg-red-50 text-red-600";
                        titleStr = `Dia ${dayNum} - Fim de Semana`;
                      }
                      if (holidayCheck.isHoliday) {
                        bgClass = "bg-rose-100 text-rose-700";
                        titleStr = `Dia ${dayNum} - Feriado: ${holidayCheck.reason}`;
                      }

                      return (
                        <th 
                          key={`v-day-${dayNum}`} 
                          className={`py-1 px-0 text-center border-r border-slate-200 font-mono min-w-0 ${bgClass}`}
                          title={titleStr}
                        >
                          {dayNum}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {parsedAnalysts.map((analyst) => {
                    // Sum of all allocated (reserved) hours in this month, skipping 24 (deactivated days)
                    let totalReserved = 0;
                    for (let dayNum = 1; dayNum <= maxDays; dayNum++) {
                      const dateKey = `${selectedYear}-${pad(selectedMonth)}-${pad(dayNum)}`;
                      const val = analyst.allocatedHours?.[dateKey] || 0;
                      if (val !== 24) {
                        totalReserved += val;
                      }
                    }

                    return (
                      <tr key={analyst.id} className="hover:bg-indigo-100/70 transition-colors">
                        <td className="py-1 px-1 border-r border-slate-200 font-semibold text-slate-800 truncate max-w-full">
                          {analyst.name}
                        </td>
                        <td className="py-1 px-0.5 border-r border-slate-200 text-slate-700 text-center font-bold font-mono">
                          {Number(totalReserved.toFixed(1)).toString().replace(".", ",")}h
                        </td>
                        {Array.from({ length: maxDays }).map((_, idx) => {
                          const dayNum = idx + 1;
                          const dateKey = `${selectedYear}-${pad(selectedMonth)}-${pad(dayNum)}`;
                          const dateObj = new Date(selectedYear, selectedMonth - 1, dayNum);
                          const holidayCheck = checkHolidayOrWeekend(dateObj);

                          const reservedHours = analyst.allocatedHours?.[dateKey] || 0;
                          const availableHours = analyst.availability?.[dateKey] || 0;
                          const isDeactivated = reservedHours === 24;

                          // Validation Logic
                          let hasError = false;
                          let errorMessage = "";

                          if (!isDeactivated) {
                            if (reservedHours > 8) {
                              hasError = true;
                              errorMessage = `Erro: Reserva de ${reservedHours}h excede o limite de 8h/dia.`;
                            } else if (holidayCheck.isHoliday && reservedHours > 0) {
                              hasError = true;
                              errorMessage = `Erro: Alocação proibida em ${holidayCheck.reason || "Fim de Semana"}.`;
                            }
                          }

                          return (
                            <EditableCell
                              key={`v-cell-${analyst.id}-${dayNum}`}
                              analystId={analyst.id}
                              dateKey={dateKey}
                              reservedHours={reservedHours}
                              availableHours={availableHours}
                              isDeactivated={isDeactivated}
                              hasError={hasError}
                              errorMessage={errorMessage}
                              holidayCheck={holidayCheck}
                              validationTab={validationTab}
                              onUpdateHour={handleUpdateHour}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend / instruction note placed as integrated table footer */}
            <div className="bg-slate-50 p-2.5 border-t border-slate-200 text-[10px] text-slate-600 leading-relaxed">
              {validationTab === "reservas" ? (
                <span>
                  <strong>Tabela de Horas Reservadas:</strong> Mostra quanto tempo o analista já tem reservado/ocupado em outros planejamentos. Valores incorretos (ex.: mais de 8h reservadas em dias úteis ou qualquer reserva em finais de semana/feriados) serão realçados em <strong className="text-red-600">vermelho</strong>. Campos são <strong>editáveis diretamente</strong> na tabela para correção rápida.
                </span>
              ) : (
                <span>
                  <strong>Tabela de Disponibilidade Calculada:</strong> Mostra o tempo livre disponível para novas alocações (calculado como <code>8h padrão - Horas Reservadas</code>). Finais de semana e feriados possuem disponibilidade travada em <code>0h</code>. Você pode editar os valores diretamente para alterar a disponibilidade (ajustando a reserva proporcionalmente).
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Core Allocation Trigger Action Button */}
      <div className="pt-2 flex justify-center">
        <button
          onClick={handleAllocate}
          disabled={isLoading || !analystsCsv.trim() || !projectsCsv.trim()}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm disabled:shadow-none hover:shadow-md transition-all flex items-center justify-center gap-2.5 w-full md:w-auto min-w-[300px] cursor-pointer"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Processando e Otimizando...</span>
            </>
          ) : (
            <span>Distribuir Horas</span>
          )}
        </button>
      </div>
    </div>
  );
}
