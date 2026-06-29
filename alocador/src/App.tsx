import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, AlertTriangle, CheckCircle2, 
  Settings, RefreshCw, Calendar, Sparkles, HelpCircle 
} from "lucide-react";
import { parseAnalystsCSV, parseProjectsCSV } from "./utils/csvParser";
import { allocateProjects } from "./utils/scheduler";
import { Analyst, Project, AllocationResult } from "./types";
import UploadSection from "./components/UploadSection";
import ResultsSection from "./components/ResultsSection";
import { NEW_SAMPLE_ANALYSTS_CSV, NEW_SAMPLE_PROJECTS_CSV } from "./utils/sampleData";

export default function App() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);

  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocationResult, setAllocationResult] = useState<AllocationResult | null>(null);
  
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-run on first mount using the default sample data
  useEffect(() => {
    const defaultYear = currentDate.getFullYear();
    const defaultMonth = currentDate.getMonth() + 1;
    setSelectedYear(defaultYear);
    setSelectedMonth(defaultMonth);

    handleDataLoaded({
      analystsCsv: NEW_SAMPLE_ANALYSTS_CSV,
      projectsCsv: NEW_SAMPLE_PROJECTS_CSV,
      matchingStrategy: "all",
      sortProjectsBy: "original",
      year: defaultYear,
      month: defaultMonth,
      analystCsvType: "allocated"
    });
  }, []);

  const handleDataLoaded = (data: {
    analystsCsv: string;
    projectsCsv: string;
    matchingStrategy: "any" | "all";
    sortProjectsBy: "largest_hours" | "smallest_hours" | "original";
    year: number;
    month: number;
    analystCsvType?: "availability" | "allocated";
    standardCapacity?: number;
  }) => {
    setError(null);
    setWarnings([]);
    setIsLoading(true);
    setSelectedYear(data.year);
    setSelectedMonth(data.month);

    try {
      // 1. Parse Analysts
      const parsedAnalystsResult = parseAnalystsCSV(
        data.analystsCsv,
        data.year,
        data.month,
        data.analystCsvType || "availability",
        data.standardCapacity || 8
      );
      
      // 2. Parse Projects
      const parsedProjectsResult = parseProjectsCSV(data.projectsCsv);

      // Collect warnings
      const combinedWarnings = [
        ...parsedAnalystsResult.warnings,
        ...parsedProjectsResult.warnings
      ];

      setAnalysts(parsedAnalystsResult.analysts);
      setProjects(parsedProjectsResult.projects);
      setWarnings(combinedWarnings);

      // 3. Run allocation engine
      const allocation = allocateProjects(
        parsedAnalystsResult.analysts,
        parsedProjectsResult.projects,
        {
          matchingStrategy: data.matchingStrategy,
          sortProjectsBy: data.sortProjectsBy,
          year: data.year,
          month: data.month
        }
      );

      setAllocationResult(allocation);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro inesperado ao processar os arquivos CSV.");
      setAllocationResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Premium Geometric Balance Header Banner */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0 shadow-xs mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <div className="w-5 h-5 border-2 border-white rotate-45"></div>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 font-display uppercase">
                ALOC<span className="text-indigo-600">AI</span>
              </h1>
              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 rounded text-[9px] font-bold text-indigo-600 uppercase tracking-wider">
                Hospitalidade
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              Alocação Otimizada de Analistas
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Error Notification Alert */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-sm flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900 mb-0.5">Falha no Processamento</h4>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8">
          {/* Main inputs section (Uploader, parameters, trigger) */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" />
                Configurar Alocação
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cole os dados de reservas de analistas e demandas de projetos para fazer a distribuição perfeita de horas.
              </p>
            </div>

            <UploadSection onDataLoaded={handleDataLoaded} isLoading={isLoading} />
          </section>



          {/* Results Display section */}
          {allocationResult && !isLoading && (
            <ResultsSection 
              result={allocationResult} 
              projects={projects} 
              analysts={analysts} 
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-slate-400 border-t border-slate-100 pt-8 max-w-7xl mx-auto px-4">
        <p>© 2026 Alocador de Projetos. Projetado para integração perfeita com o Planilhas Google.</p>
        <p className="mt-1.5 text-[10px] text-slate-300">Respeitando Leis e Feriados: Brasil (Nacional), Estado do Rio de Janeiro (Estadual) e Município do Rio de Janeiro (Municipal).</p>
      </footer>
    </div>
  );
}
