import { useState, useEffect } from 'react';
import { Activity, Shield, AlertTriangle, CheckCircle2, Clock, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ApiHealth {
  status: string;
  hasKey: boolean;
  keyLength: number;
  envUsed: string;
  lastError: { message: string; timestamp: number } | null;
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    lastCallTimestamp: number;
  };
}

export function ApiStatusTracker({ variant = 'full' }: { variant?: 'full' | 'minimal' }) {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isErrorExpanded, setIsErrorExpanded] = useState(false);

  const checkHealth = async () => {
    setIsLoading(true);
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${baseUrl}api/health`.replace(/\/+/g, '/'));
      if (!response.ok) throw new Error('API Unreachable');
      const data = await response.json();
      setHealth(data);
      setLastChecked(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setHealth(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  if (isDismissed && variant === 'minimal') return null;

  return (
    <div className={cn("space-y-4", variant === 'minimal' ? "w-full" : "")}>
      {/* CRITICAL ALERT BLOCK - Shown in all variants */}
      <AnimatePresence>
        {health?.lastError && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-rose-500/20 border border-rose-500/40 p-4 rounded-2xl flex flex-col gap-3">
              <div className="flex gap-3">
                <AlertTriangle className="text-rose-500 shrink-0" size={20} />
                <div className="flex-1">
                  <div className="text-[10px] font-black tracking-widest text-rose-500 uppercase">Critical API Alert</div>
                  <div className={cn(
                    "text-xs text-brand-text mt-1 leading-relaxed transition-all duration-300",
                    isErrorExpanded ? "" : "line-clamp-2"
                  )}>
                    {health.lastError.message}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="text-[8px] text-brand-text-muted uppercase font-bold">
                      Occurred: {new Date(health.lastError.timestamp).toLocaleTimeString()}
                    </div>
                    {health.lastError.message.length > 100 && (
                      <button 
                        onClick={() => setIsErrorExpanded(!isErrorExpanded)}
                        className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors"
                      >
                        {isErrorExpanded ? (
                          <>Collapse <ChevronUp size={10} /></>
                        ) : (
                          <>Expand Details <ChevronDown size={10} /></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setHealth(prev => prev ? { ...prev, lastError: null } : null)}
                  className="p-1 hover:bg-rose-500/20 rounded-lg transition-colors h-fit self-start"
                >
                  <X size={14} className="text-rose-500" />
                </button>
              </div>

              <AnimatePresence>
                {isErrorExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-3 bg-black/40 rounded-xl border border-rose-500/20 font-mono text-[10px] text-brand-text-muted break-all max-h-40 overflow-y-auto custom-scrollbar leading-relaxed">
                      {health.lastError.message}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MINIMAL STATUS INDICATOR - Full-width Banner style */}
      <AnimatePresence>
        {variant === 'minimal' && !health?.lastError && !isDismissed && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-brand-cyan/10 border-b border-brand-cyan/20 backdrop-blur-md px-6 py-2 flex items-center justify-between"
          >
            <div className="flex items-center gap-6 overflow-hidden">
              <div className="flex items-center gap-2 shrink-0">
                <Activity size={12} className="text-brand-cyan animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-cyan/80">Neural Uplink Status:</span>
              </div>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
                  health?.status === 'ok' ? "text-emerald-400 bg-emerald-400" : (error ? "text-rose-500 bg-rose-500" : "text-amber-500 bg-amber-500")
                )} />
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest truncate",
                  health?.status === 'ok' ? "text-emerald-400" : (error ? "text-rose-500" : "text-amber-500")
                )}>
                  {isLoading ? 'Synchronizing Neural Matrices...' : (error ? 'Neural Connection Severed' : (health?.status === 'ok' ? 'All Systems Operational' : 'Hardware Degradation Detected'))}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-1.5 font-mono text-[9px] font-black text-brand-text-muted uppercase">
                <Clock size={10} />
                {lastChecked.toLocaleTimeString()}
              </div>
              <div className="h-4 w-[1px] bg-white/10" />
              <button 
                onClick={() => setIsDismissed(true)}
                className="group flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded-lg transition-all"
              >
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-text-muted group-hover:text-brand-text">Dismiss</span>
                <X size={14} className="text-brand-text-muted group-hover:text-brand-text" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {variant === 'full' && (
        <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-brand-cyan" />
              <span className="text-xs font-bold text-brand-text-muted uppercase tracking-widest">API Infrastructure</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[8px] font-black text-brand-text-muted uppercase">
              <Clock size={10} />
              {lastChecked.toLocaleTimeString()}
            </div>
          </div>

          <div className="space-y-4">
            {isLoading && !health && (
              <div className="h-20 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500">
                <AlertTriangle size={20} />
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest">Connection Error</div>
                  <div className="text-xs opacity-80">{error}</div>
                </div>
              </div>
            )}

            {health && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2">
                    {health.status === 'ok' ? (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-500" />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted">Core Status</span>
                  </div>
                  <span className={health.status === 'ok' ? "text-emerald-500 text-xs font-bold" : "text-amber-500 text-xs font-bold"}>
                    {health.status === 'ok' ? 'OPERATIONAL' : 'DEGRADED'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className={health.hasKey ? "text-brand-cyan" : "text-rose-500"} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted">Gemini Auth</span>
                  </div>
                  <span className={health.hasKey ? "text-brand-cyan text-xs font-bold" : "text-rose-500 text-xs font-bold"}>
                    {health.hasKey ? 'AUTHENTICATED' : 'MISSING KEY'}
                  </span>
                </div>

                {/* CALL ANALYTICS */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-center">
                    <div className="text-[7px] text-brand-text-muted uppercase font-black mb-1">Total</div>
                    <div className="text-xs text-brand-text font-bold">{health.stats.totalCalls}</div>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-center">
                    <div className="text-[7px] text-brand-text-muted uppercase font-black mb-1 text-emerald-500">Success</div>
                    <div className="text-xs text-emerald-500 font-bold">{health.stats.successfulCalls}</div>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-center">
                    <div className="text-[7px] text-brand-text-muted uppercase font-black mb-1 text-rose-500">Fail</div>
                    <div className="text-xs text-rose-500 font-bold">{health.stats.failedCalls}</div>
                  </div>
                </div>

                {health.hasKey && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <div className="text-[7px] text-brand-text-muted uppercase font-black mb-1">Active Env</div>
                      <div className="text-[9px] text-brand-cyan font-mono truncate">{health.envUsed}</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                      <div className="text-[7px] text-brand-text-muted uppercase font-black mb-1">Last Activity</div>
                      <div className="text-[9px] text-brand-text truncate">
                        {health.stats.lastCallTimestamp ? new Date(health.stats.lastCallTimestamp).toLocaleTimeString() : 'N/A'}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          <button 
            onClick={checkHealth}
            disabled={isLoading}
            className="w-full py-2 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-[0.2em] text-brand-text-muted disabled:opacity-50"
          >
            {isLoading ? 'polling matrix...' : 'manual diagnostics'}
          </button>
        </div>
      )}
    </div>
  );
}
