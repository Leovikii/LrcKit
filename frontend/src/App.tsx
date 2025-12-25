import { useState, useRef, useEffect } from 'react';
import { ScanFiles, ConvertVtt, RecycleFiles, SelectDir, ScanByExt, ScanDropped } from "../wailsjs/go/main/App";
import { WindowMinimise, Quit, EventsOn, OnFileDrop } from "../wailsjs/runtime/runtime";
import { 
  FolderOpen, RefreshCw, Trash2, FileCode, CheckCircle2, XCircle, 
  Loader2, Settings, Eraser, Music, Minus, X, TerminalSquare, AlertCircle, UploadCloud, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type FileItem = {
  id: string;
  name: string;
  path: string;
  status: 'pending' | 'processing' | 'success' | 'error';
};

type AppConfig = {
  autoDeleteVtt: boolean;
  cleanerExts: string;
}

type LogEntry = {
  time: string;
  level: string;
  msg: string;
}

const VIEWS = {
  CONVERT: 'convert',
  CLEANER: 'cleaner',
  LOGS: 'logs',
  SETTINGS: 'settings'
}

const SidebarItem = ({ id, icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 relative group z-20",
      active ? "text-white" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
    )}
    title={label}
  >
    <Icon className="w-5 h-5 relative z-10" />
    {active && (
      <motion.div 
        layoutId="active-bg" 
        className="absolute inset-0 bg-blue-600 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] z-0"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    )}
  </button>
);

function App() {
  const [view, setView] = useState(VIEWS.CONVERT);
  
  const [convertList, setConvertList] = useState<FileItem[]>([]);
  const [cleanList, setCleanList] = useState<FileItem[]>([]);
  
  const [working, setWorking] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [alertMsg, setAlertMsg] = useState<{title: string, content: string} | null>(null);
  
  const [config, setConfig] = useState<AppConfig>({
    autoDeleteVtt: true,
    cleanerExts: 'wav'
  });

  const configRef = useRef(config);
  const viewRef = useRef(view);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { viewRef.current = view; }, [view]);

  const getCurrentListState = (targetView = view) => {
    return targetView === VIEWS.CLEANER 
      ? { list: cleanList, setList: setCleanList }
      : { list: convertList, setList: setConvertList };
  };

  const logError = (msg: string) => {
    setLogs(prev => [...prev, {
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'Error',
        msg: msg
    }]);
  };

  const showAlert = (title: string, content: string) => {
      setAlertMsg({ title, content });
  };

  useEffect(() => {
    const saved = localStorage.getItem('lrckit-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      const { devMode, ...cleanConfig } = parsed; 
      setConfig(prev => ({...prev, ...cleanConfig}));
    }

    EventsOn("app-log", (data: any) => {
      setLogs(prev => [...prev, {
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: data.level,
        msg: data.msg
      }]);
    });

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        dragCounter.current += 1;
        if (e.dataTransfer && e.dataTransfer.items.length > 0) setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) { setIsDragging(false); dragCounter.current = 0; }
    };
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };
    const handleDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); dragCounter.current = 0; };
    
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    OnFileDrop(async (x, y, paths) => {
        setIsDragging(false);
        dragCounter.current = 0;

        if (!paths || paths.length === 0) return;

        const currentConfig = configRef.current;
        let currentView = viewRef.current;

        if (currentView === VIEWS.SETTINGS || currentView === VIEWS.LOGS) {
            setView(VIEWS.CONVERT);
            currentView = VIEWS.CONVERT;
        }

        const mode = currentView === VIEWS.CLEANER ? "cleaner" : "convert";
        
        try {
            const res = await ScanDropped(paths, mode, currentConfig.cleanerExts);
            const safeRes = res || [];
            
            if (safeRes.length === 0) {
                showAlert(
                    "No Supported Files", 
                    `No matching files were found in the dropped selection.\n\nCurrent Mode: ${mode.toUpperCase()}\nExtensions: ${mode === 'convert' ? '.vtt, .srt' : currentConfig.cleanerExts}`
                );
                return;
            }
            
            if (currentView === VIEWS.CLEANER) {
                setCleanList(safeRes.map((f: any) => ({ ...f, status: 'pending' })));
            } else {
                setConvertList(safeRes.map((f: any) => ({ ...f, status: 'pending' })));
            }

        } catch (e) {
            logError("Drag load failed: " + String(e));
        }
    }, false); 

    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    if (view === VIEWS.LOGS && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, view]);

  const updateConfig = (newConfig: Partial<AppConfig>) => {
    const final = { ...config, ...newConfig };
    setConfig(final);
    localStorage.setItem('lrckit-config', JSON.stringify(final));
  };

  const handleSelect = async () => {
    const { setList } = getCurrentListState();
    setList([]); 
    
    try {
        const dir = await SelectDir();
        if (!dir) return;

        let res;
        if (view === VIEWS.CONVERT) res = await ScanFiles(dir);
        else if (view === VIEWS.CLEANER) res = await ScanByExt(dir, config.cleanerExts);
        
        const safeRes = res || [];
        setList(safeRes.map((f: any) => ({ ...f, status: 'pending' })));
    } catch (e) {
        logError("Selection failed: " + String(e));
    }
  };

  const removeFile = (id: string) => {
    if (working) return;
    const { setList } = getCurrentListState();
    setList(prev => prev.filter(f => f.id !== id));
  };

  const runTask = async () => {
    const { list, setList } = getCurrentListState();
    if (list.length === 0) return;
    
    setWorking(true);
    
    if (view === VIEWS.CONVERT) {
      const newFiles = [...list];
      for (let i = 0; i < newFiles.length; i++) {
        if (newFiles[i].status === 'success') continue;
        newFiles[i].status = 'processing';
        setList([...newFiles]);
        
        const res = await ConvertVtt(newFiles[i].path, config.autoDeleteVtt);
        newFiles[i].status = res === 'success' ? 'success' : 'error';
        setList([...newFiles]);
        
        if (listRef.current) listRef.current.scrollTop = i * 50;
      }
    } else if (view === VIEWS.CLEANER) {
      const toDelete = list.map(f => f.path);
      await RecycleFiles(toDelete);
      setList(list.map(f => ({ ...f, status: 'success' })));
    }
    setWorking(false);
  };

  const currentFiles = view === VIEWS.CLEANER ? cleanList : convertList;
  const stats = {
    total: currentFiles.length,
    success: currentFiles.filter(f => f.status === 'success').length,
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] font-sans text-sm select-none relative overflow-hidden text-zinc-300">
      
      <AnimatePresence>
        {alertMsg && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-100 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 max-w-sm w-full relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-blue-500 via-purple-500 to-blue-500 opacity-80" />
                    
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-full bg-red-500/10 text-red-400 shrink-0">
                                <Info className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-white leading-tight">{alertMsg.title}</h3>
                                <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">{alertMsg.content}</p>
                            </div>
                        </div>
                        
                        <div className="flex justify-end pt-2">
                            <button 
                                onClick={() => setAlertMsg(null)}
                                className="bg-white text-black hover:bg-zinc-200 font-bold py-2 px-6 rounded-lg text-xs transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed top-0 left-0 right-0 h-10 z-50 flex items-center justify-between px-3" style={{'--wails-draggable': 'drag'} as any}>
        <div className="flex items-center gap-2 pl-2 opacity-60">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
          <span className="text-[10px] font-mono tracking-[0.2em] uppercase font-bold text-white">LrcKit</span>
        </div>
        <div className="flex items-center gap-2 no-drag" style={{'--wails-draggable': 'no-drag'} as any}>
          <button onClick={WindowMinimise} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={Quit} className="w-8 h-8 flex items-center justify-center hover:bg-red-500/80 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="w-16 pt-16 pb-4 flex flex-col items-center gap-6 z-40 bg-black/20 backdrop-blur-sm border-r border-white/5">
        <SidebarItem id={VIEWS.CONVERT} icon={Music} label="Converter" active={view === VIEWS.CONVERT} onClick={() => setView(VIEWS.CONVERT)} />
        <SidebarItem id={VIEWS.CLEANER} icon={Eraser} label="Cleaner" active={view === VIEWS.CLEANER} onClick={() => setView(VIEWS.CLEANER)} />
        <SidebarItem id={VIEWS.LOGS} icon={TerminalSquare} label="Logs" active={view === VIEWS.LOGS} onClick={() => setView(VIEWS.LOGS)} />
        <div className="flex-1" />
        <SidebarItem id={VIEWS.SETTINGS} icon={Settings} label="Settings" active={view === VIEWS.SETTINGS} onClick={() => setView(VIEWS.SETTINGS)} />
      </div>

      <div className="flex-1 pt-12 pr-3 pb-3 pl-0 min-w-0 flex flex-col relative">
        <div className="flex-1 bg-[#131316] rounded-2xl border border-white/5 flex flex-col overflow-hidden relative shadow-2xl">
          
          {view === VIEWS.SETTINGS && (
            <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                <Settings className="w-5 h-5 text-zinc-500" />
                <h2 className="text-lg font-bold text-white">Settings</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="space-y-1 text-left">
                    <div className="text-zinc-200 font-medium text-xs">Auto-Delete Source</div>
                    <div className="text-[10px] text-zinc-500">Automatically move source files to Recycle Bin</div>
                  </div>
                  <button onClick={() => updateConfig({ autoDeleteVtt: !config.autoDeleteVtt })} className={cn("w-10 h-6 rounded-full transition-colors relative", config.autoDeleteVtt ? "bg-blue-600" : "bg-zinc-700")}>
                    <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", config.autoDeleteVtt ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors space-y-3">
                  <div className="flex items-center gap-2"><label className="text-zinc-200 font-medium text-xs">Batch Cleaner Extensions</label></div>
                  <input type="text" value={config.cleanerExts} onChange={(e) => updateConfig({ cleanerExts: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all font-mono" />
                  <div className="flex items-start gap-2 text-left">
                    <AlertCircle className="w-3 h-3 text-zinc-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-zinc-500 leading-tight">Separate multiple extensions with commas, for example: <span className="text-zinc-400 font-mono">wav, flac, zip</span>.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === VIEWS.LOGS && (
            <div className="flex flex-col h-full bg-black/40 font-mono text-xs">
              <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/2">
                <h2 className="font-bold text-zinc-400 flex items-center gap-2"><TerminalSquare className="w-4 h-4" /> System Logs</h2>
                <button onClick={() => setLogs([])} className="px-3 py-1 rounded-md border border-white/5 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 text-[10px]">Clear</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 hover:bg-white/5 p-1 rounded">
                    <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                    <span className={cn("font-bold shrink-0 w-12 uppercase", log.level === 'Info' && "text-blue-400", log.level === 'Error' && "text-red-500")}>{log.level}</span>
                    <span className="text-zinc-300 break-all">{log.msg}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {(view === VIEWS.CONVERT || view === VIEWS.CLEANER) && (
            <>
              <div className="p-3 border-b border-white/5 bg-white/2 flex gap-2 shrink-0">
                <button onClick={handleSelect} disabled={working} className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/20 disabled:opacity-50 transition-all rounded-lg h-9 flex items-center justify-center gap-2 text-xs font-medium text-zinc-200 border border-white/5 hover:border-white/10 cursor-pointer">
                    <FolderOpen className="w-3.5 h-3.5" /> Select
                </button>
                <button onClick={runTask} disabled={working || stats.total === 0} className={cn("flex-1 transition-all rounded-lg h-9 flex items-center justify-center gap-2 text-xs font-bold text-white shadow-lg disabled:shadow-none disabled:opacity-50 disabled:bg-zinc-800 cursor-pointer", view === VIEWS.CLEANER ? "bg-red-600 hover:bg-red-500 shadow-red-900/20" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20")}>
                  {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (view === VIEWS.CLEANER ? <Trash2 className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />)}
                  {view === VIEWS.CLEANER ? 'Clean' : 'Start'}
                </button>
              </div>

              <div 
                className="flex-1 overflow-y-auto p-2 space-y-2 relative" 
                ref={listRef}
              >
                <AnimatePresence>
                  {isDragging && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-2 z-50 bg-zinc-950/90 backdrop-blur-md rounded-2xl border-2 border-dashed border-blue-500 flex flex-col items-center justify-center gap-4 text-blue-400 pointer-events-none"
                    >
                      <div className="p-4 rounded-full bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                          <UploadCloud className="w-12 h-12" />
                      </div>
                      <div className="text-lg font-bold">Release to Load</div>
                      <div className="text-xs text-blue-400/60 font-mono">
                        {view === VIEWS.CLEANER ? `Cleaning Mode (${config.cleanerExts})` : "Converter Mode (.vtt/.srt)"}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="popLayout">
                  {currentFiles.map((file, index) => (
                    <motion.div 
                      key={file.id} layout
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: index * 0.03 }}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 relative overflow-hidden",
                        file.status === 'pending' && "bg-white/5 border-white/5 hover:bg-white/10",
                        file.status === 'processing' && "bg-blue-500/10 border-blue-500/20",
                        file.status === 'success' && "bg-emerald-500/5 border-emerald-500/10 opacity-70",
                        file.status === 'error' && "bg-red-500/5 border-red-500/10"
                      )}
                    >
                      {file.status === 'processing' && (
                        <motion.div 
                          layoutId="ph" 
                          className="absolute inset-0 bg-linear-to-r from-transparent via-blue-500/10 to-transparent z-0" 
                          initial={{ x: "-100%" }} 
                          animate={{ x: "100%" }} 
                          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} 
                        />
                      )}

                      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors z-10",
                        file.status === 'pending' && "bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700",
                        file.status === 'processing' && "bg-blue-500/20 text-blue-400",
                        file.status === 'success' && "bg-emerald-500/20 text-emerald-400",
                        file.status === 'error' && "bg-red-500/20 text-red-400"
                      )}>
                        {file.status === 'pending' && <FileCode className="w-4 h-4" />}
                        {file.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin" />}
                        {file.status === 'success' && <CheckCircle2 className="w-4 h-4" />}
                        {file.status === 'error' && <XCircle className="w-4 h-4" />}
                      </div>
                      
                      <div className="flex-1 min-w-0 z-10">
                        <div className="flex items-center gap-2">
                            <div className="text-xs font-medium text-zinc-200 truncate">{file.name}</div>
                            {file.status !== 'pending' && <span className={cn("text-[9px] px-1 py-0.5 rounded uppercase font-bold", file.status === 'success' && "bg-emerald-500/20 text-emerald-300", file.status === 'error' && "bg-red-500/20 text-red-300")}>{file.status}</span>}
                        </div>
                        <div className="text-[9px] text-zinc-500 truncate font-mono mt-0.5">{file.path}</div>
                      </div>

                      {file.status === 'pending' && !working && (
                        <button onClick={(e) => { e.stopPropagation(); removeFile(file.id); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {currentFiles.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-700 gap-3 opacity-40 pointer-events-none pb-10">
                    {view === VIEWS.CLEANER ? <Eraser className="w-10 h-10 stroke-1" /> : <FolderOpen className="w-10 h-10 stroke-1" />}
                    <div className="text-[10px] font-medium uppercase tracking-widest">{view === VIEWS.CLEANER ? "Drag files to Clean" : "Drag files to Convert"}</div>
                  </div>
                )}
              </div>
              
              <div className={cn("h-8 border-t border-white/5 flex items-center justify-between px-3 transition-colors", working ? "bg-blue-900/10" : "bg-transparent")}>
                <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-500">
                  <span>TOTAL: {stats.total}</span>
                  {view === VIEWS.CONVERT && stats.success > 0 && <span className="text-emerald-500">DONE: {stats.success}</span>}
                  {view === VIEWS.CLEANER && stats.success > 0 && <span className="text-red-500">DELETED: {stats.success}</span>}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{working ? "Processing..." : "Ready"}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;