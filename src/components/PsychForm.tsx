import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ClipboardList, SendHorizonal } from 'lucide-react';

export interface Question {
  id: string;
  label: string;
  type: 'text' | 'longtext' | 'number';
  placeholder?: string;
}

interface PsychFormProps {
  header: string;
  rationale: string;
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  isLoading?: boolean;
}

export function PsychForm({ header, rationale, questions, onSubmit, isLoading }: PsychFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const isFormValid = questions.every(q => answers[q.id]?.trim());

  return (
    <div className="bg-bento-card border border-bento-border rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-brand-cyan/10 rounded-lg">
          <ClipboardList className="text-brand-cyan" size={20} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-brand-text tracking-tight">{header}</h3>
          <p className="text-[10px] text-brand-text-muted uppercase tracking-widest font-semibold mt-0.5">Required Contextual Data</p>
        </div>
      </div>

      <div className="bg-brand-cyan/5 border-l-2 border-brand-cyan p-3 rounded-r-lg mb-6">
        <p className="text-[11px] leading-relaxed text-brand-text-muted">
          <span className="text-brand-cyan font-semibold">Rationale:</span> {rationale}
        </p>
      </div>

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          if (isFormValid) onSubmit(answers);
        }}
        className="space-y-5"
      >
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-brand-text-muted/80 ml-1">{q.label}</label>
            {q.type === 'longtext' ? (
              <textarea
                value={answers[q.id] || ''}
                onChange={(e) => handleChange(q.id, e.target.value)}
                placeholder={q.placeholder}
                className="w-full bg-brand-text-muted/5 border border-bento-border rounded-xl px-4 py-3 text-sm text-brand-text placeholder-brand-text-muted/40 focus:ring-1 focus:ring-brand-cyan focus:border-transparent transition-all min-h-[100px] resize-none"
              />
            ) : (
              <input
                type={q.type}
                value={answers[q.id] || ''}
                onChange={(e) => handleChange(q.id, e.target.value)}
                placeholder={q.placeholder}
                className="w-full bg-brand-text-muted/5 border border-bento-border rounded-xl px-4 py-2.5 text-sm text-brand-text placeholder-brand-text-muted/40 focus:ring-1 focus:ring-brand-cyan focus:border-transparent transition-all"
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={!isFormValid || isLoading}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all shadow-lg",
            isFormValid 
              ? "bg-brand-purple text-white hover:opacity-90 shadow-brand-purple/20" 
              : "bg-brand-text-muted/20 text-brand-text-muted/40 cursor-not-allowed shadow-none"
          )}
        >
          {isLoading ? (
            <div className="flex gap-2 items-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" />
              Processing Responses
            </div>
          ) : (
            <>
              Submit Context Observations
              <SendHorizonal size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
