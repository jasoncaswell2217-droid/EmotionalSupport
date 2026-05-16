import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Brain, Eye, EyeOff, Activity, ChevronDown, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { PsychForm, Question } from './PsychForm';

interface ChatMessageProps {
  id?: string;
  role: 'user' | 'model';
  content?: string;
  parts?: any[];
  functionCall?: {
    name: string;
    args: {
      questions: Question[];
      context_header: string;
      rationale: string;
    };
  };
  onFormSubmit?: (answers: Record<string, string>) => void;
  onFeedback?: (messageId: string, isAccurate: boolean) => void;
  isLoading?: boolean;
  timestamp?: number;
}

export const ChatMessage = memo(function ChatMessage({ id, role, content, parts, functionCall, onFormSubmit, onFeedback, isLoading, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';
  const [feedbackGiven, setFeedbackGiven] = useState<'accurate' | 'inaccurate' | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(isUser); // Default collapsed for user messages to save space
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const images = useMemo(() => parts?.filter(p => p.inlineData).map(p => p.inlineData.data) || [], [parts]);
  const stableHash = useMemo(() => Math.random().toString(16).slice(2, 8).toUpperCase(), []);

  const handleFeedback = (accurate: boolean) => {
    if (feedbackGiven || !onFeedback || !id) return;
    setFeedbackGiven(accurate ? 'accurate' : 'inaccurate');
    onFeedback(id, accurate);
  };

  // Split content for model responses if it contains a Psychological Analysis section
  const { displayContent, analysisContent } = useMemo(() => {
    if (isUser || !content) return { displayContent: content, analysisContent: null };
    
    const splitMarkers = [
      '### Psychological Analysis',
      '## Psychological Analysis',
      '**Psychological Analysis**',
      'Psychological Analysis:'
    ];
    
    for (const marker of splitMarkers) {
      if (content.includes(marker)) {
        const parts = content.split(marker);
        return {
          displayContent: parts[0].trim(),
          analysisContent: marker + parts[1]
        };
      }
    }
    
    return { displayContent: content, analysisContent: null };
  }, [content, isUser]);

  return (
    <motion.div
      id={id || `msg-${stableHash}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full max-w-full mb-8 gap-2 md:gap-4 px-1 md:px-0",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border",
        isUser 
          ? "bg-brand-text-muted/10 border-bento-border text-brand-text-muted" 
          : "bg-brand-cyan/10 border-brand-cyan/20 text-brand-cyan shadow-[0_0_15px_var(--theme-accent-1)]"
      )}>
        {isUser ? <User size={18} className="md:w-5 md:h-5" /> : <Brain size={18} className="md:w-5 md:h-5" />}
      </div>

      <div className={cn(
        "flex-1 min-w-0 rounded-2xl flex flex-col gap-3",
        isUser 
          ? "items-end" 
          : "items-start"
      )}>
        {isUser && (
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-text-muted/5 border border-bento-border hover:bg-brand-text-muted/10 transition-all text-[11px] font-bold uppercase tracking-widest text-brand-text-muted hover:text-brand-text group active:scale-95"
          >
            {isCollapsed ? (
              <>
                <Eye size={12} className="group-hover:text-brand-cyan" />
                <span>Show Observation</span>
              </>
            ) : (
              <>
                <EyeOff size={12} className="group-hover:text-brand-purple" />
                <span>Minimize Log</span>
              </>
            )}
          </button>
        )}

        {!isCollapsed && (
          <motion.div 
            animate={{ 
              height: isCollapsed ? 0 : "auto",
              opacity: isCollapsed ? 0 : 1,
              marginTop: isCollapsed ? -12 : 0
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              "max-w-full w-fit max-w-[95%] md:max-w-full rounded-2xl shadow-2xl relative overflow-hidden",
              isCollapsed && "pointer-events-none",
              isUser ? "bg-brand-text-muted/5 text-brand-text border border-bento-border rounded-tr-none" 
                     : "bg-bento-card border border-bento-border rounded-tl-none"
            )}
          >
            <div className="p-3 md:p-5 lg:p-8 w-full overflow-hidden">
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6 w-full">
                  {images.map((img, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden border border-bento-border shadow-lg max-w-full md:max-w-[400px]">
                      <img src={`data:image/jpeg;base64,${img}`} className="w-full h-auto object-contain" alt="Attached visual evidence" />
                    </div>
                  ))}
                </div>
              )}

              {content && (
                <div className={cn(
                  "prose prose-brand max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 text-[13px] md:text-[15.5px] tracking-wide text-brand-text break-words overflow-x-hidden",
                  "!text-brand-text w-full" // Force color to match theme
                )}>
                  <ReactMarkdown>{displayContent || ""}</ReactMarkdown>
                  
                  {analysisContent && (
                    <div className="mt-6 md:mt-8 border border-brand-cyan/20 rounded-2xl bg-brand-cyan/[0.03] overflow-hidden transition-all duration-300">
                      <button 
                        onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                        className="w-full flex items-center justify-between p-4 bg-brand-cyan/5 hover:bg-brand-cyan/10 transition-colors group min-h-[48px]"
                      >
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="p-1 md:p-1.5 bg-brand-cyan/20 rounded-lg text-brand-cyan">
                            <Activity size={12} className="md:w-[14px] md:h-[14px]" />
                          </div>
                          <span className="text-[10px] md:text-[12px] font-bold uppercase tracking-[0.1em] md:tracking-[0.15em] text-brand-cyan group-hover:text-brand-text transition-colors">
                            Deep Psychological Analysis
                          </span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2">
                          <span className="text-[9px] md:text-[10px] font-mono text-brand-cyan/40 uppercase hidden xs:inline">
                            {isAnalysisExpanded ? "Minimize" : "Access Data"}
                          </span>
                          <motion.div
                            animate={{ rotate: isAnalysisExpanded ? 180 : 0 }}
                          >
                            <ChevronDown size={14} className="text-brand-cyan" />
                          </motion.div>
                        </div>
                      </button>
                      
                      <motion.div
                        initial={false}
                        animate={{ 
                          height: isAnalysisExpanded ? "auto" : 0,
                          opacity: isAnalysisExpanded ? 1 : 0
                        }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 md:p-6 border-t border-brand-cyan/10 bg-brand-cyan/[0.02]">
                          <ReactMarkdown>{analysisContent}</ReactMarkdown>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </div>
              )}
              
              <div className={cn(
                "pt-4 border-t border-bento-border flex flex-col md:flex-row md:items-center justify-between gap-4 text-brand-text-muted/70",
                (content || images.length > 0) ? "mt-5" : "mt-0"
              )}>
                <div className="flex items-center gap-4">
                  {timestamp && (
                    <span className="text-[10px] font-mono tracking-wider text-brand-text-muted">
                      {new Date(timestamp).toLocaleDateString()} {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  {!isUser && (
                    <div className="flex items-center gap-2">
                      {feedbackGiven ? (
                        <div className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                          feedbackGiven === 'accurate' ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-purple/10 text-brand-purple"
                        )}>
                          <Check size={10} />
                          {feedbackGiven === 'accurate' ? "Verified Accurate" : "Logged as Inaccurate"}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleFeedback(true)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/20 transition-all text-[9.5px] font-black uppercase tracking-widest active:scale-95"
                          >
                            <ThumbsUp size={12} />
                            <span>Accurate</span>
                          </button>
                          <button 
                            onClick={() => handleFeedback(false)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple hover:bg-brand-purple/20 transition-all text-[9.5px] font-black uppercase tracking-widest active:scale-95"
                          >
                            <ThumbsDown size={12} />
                            <span>Not Accurate</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}


        {functionCall && functionCall.name === 'request_information' && (
          <div className="mt-4">
            <PsychForm
              header={functionCall.args.context_header}
              rationale={functionCall.args.rationale}
              questions={functionCall.args.questions}
              onSubmit={onFormSubmit || (() => {})}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
});

