import { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Brain, 
  Mail, 
  Lock, 
  ArrowRight, 
  ShieldAlert, 
  Chrome, 
  UserPlus, 
  LogIn,
  AlertCircle,
  Loader2,
  ChevronLeft
} from 'lucide-react';
import { cn } from '../lib/utils';

interface AuthLandingProps {
  onGuestMode?: () => void;
  onShowHowItWorks?: () => void;
}

export function AuthLanding({ onGuestMode, onShowHowItWorks }: AuthLandingProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setError("Wait: Reset email sent. Please check your inbox.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-black text-brand-text flex flex-col items-center justify-start lg:justify-center relative overflow-y-auto overflow-x-hidden font-sans custom-scrollbar selection:bg-brand-cyan/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-brand-cyan/10 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-brand-purple/10 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none" />
      </div>

      <div className="w-full max-w-6xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center z-10 py-12 lg:py-0">
        {/* Left Side: Brand & Disclaimer */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-8"
        >
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-purple flex items-center justify-center shadow-2xl shadow-brand-cyan/20 ring-1 ring-white/10 shrink-0">
              <Brain size={20} className="md:hidden text-white" />
              <Brain size={36} className="hidden md:block text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-5xl font-display font-black tracking-tighter text-brand-text italic leading-none">
                My Psych <span className="text-brand-cyan">Lens</span>
              </h1>
              <p className="text-[8px] md:text-sm text-brand-text-muted uppercase tracking-[0.4em] font-black mt-2 opacity-50">
                Advanced Analytical Matrix v1.2
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-3xl md:text-6xl font-display font-medium text-brand-text leading-[1.1] tracking-tighter italic">
              Understand the <br /> <span className="text-brand-cyan">unseen paths</span> of thought.
            </h2>
            <p className="text-brand-text-muted text-lg md:text-xl font-light leading-relaxed max-w-xl">
              My Psych Lens is the world's most advanced analytical mirror. Harness state-of-the-art AI to decode deep behavioral signals, map cognitive breakthroughs, and achieve ultimate psychological synthesis.
            </p>
          </div>

          {/* Multi-Purpose Disclaimer Card */}
          <div className="bg-brand-cyan/5 border border-brand-cyan/10 p-6 rounded-3xl space-y-4 backdrop-blur-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShieldAlert size={40} className="text-brand-cyan" />
            </div>
            <div className="flex items-center gap-3 text-brand-cyan">
              <ShieldAlert size={20} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Research & Safety Protocol</span>
            </div>
            <p className="text-sm text-brand-text-muted leading-relaxed font-light">
              We empower discovery. Please note that My Psych Lens is an <span className="text-brand-text">educational simulation framework</span>. It is designed to assist in pattern analysis and should not be used as a substitute for professional medical or psychiatric consultation.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 pt-4">
            <div className="flex flex-col">
              <span className="text-2xl font-display font-black text-brand-text">1.2ms</span>
              <span className="text-[10px] uppercase tracking-widest text-brand-text-muted font-bold">Inference Speed</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-6">
              <span className="text-2xl font-display font-black text-brand-text">256-bit</span>
              <span className="text-[10px] uppercase tracking-widest text-brand-text-muted font-bold">Neural Encryption</span>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-6">
              <span className="text-2xl font-display font-black text-brand-text">∞</span>
              <span className="text-[10px] uppercase tracking-widest text-brand-text-muted font-bold">Cognitive Nodes</span>
            </div>
          </div>
        </motion.div>

        {/* Right Side: Auth Container */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-brand-cyan/20 to-brand-purple/20 blur-3xl opacity-30 rounded-full" />
          
          <div className="bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-brand-cyan to-transparent opacity-50" />
            
            <AnimatePresence mode="wait">
              {mode !== 'reset' ? (
                <motion.div 
                  key={mode}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  <div>
                    <h3 className="text-2xl md:text-3xl font-display font-bold text-brand-text tracking-tight">
                      {mode === 'login' ? 'System Login' : 'Register Profile'}
                    </h3>
                    <p className="text-brand-text-muted text-xs md:text-sm mt-2 font-light">
                      {mode === 'login' 
                        ? 'Initialize secure analytical session.' 
                        : 'Create a new subject entry in the matrix.'}
                    </p>
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div className="space-y-4">
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-muted group-focus-within:text-brand-cyan transition-colors" size={18} />
                        <input 
                          type="email" 
                          placeholder="Personnel Email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-cyan/50 focus:border-brand-cyan/50 transition-all"
                        />
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-muted group-focus-within:text-brand-cyan transition-colors" size={18} />
                        <input 
                          type="password" 
                          placeholder="Password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-cyan/50 focus:border-brand-cyan/50 transition-all text-brand-text"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs font-mono">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-brand-cyan text-black font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-brand-cyan/80 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-brand-cyan/10"
                    >
                      {isLoading ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <>
                          <span>{mode === 'login' ? 'Login' : 'Register Account'}</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-brand-text-muted">
                      <span className="bg-[#0a0a0a] px-4">Secondary Uplink</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl py-4 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                      <Chrome size={18} className="text-brand-cyan" />
                      <span className="text-xs uppercase font-bold tracking-widest">Connect with Google</span>
                    </button>
                    
                    {onGuestMode && (
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={onGuestMode}
                          className="text-[10px] text-brand-text-muted/60 hover:text-brand-cyan uppercase tracking-widest font-black transition-all"
                        >
                          Proceed as Guest (Local Only)
                        </button>
                        {onShowHowItWorks && (
                          <button 
                            onClick={onShowHowItWorks}
                            className="px-6 py-2 border border-white/10 rounded-xl text-[10px] text-brand-cyan uppercase tracking-widest font-black transition-all hover:bg-brand-cyan/5 hover:border-brand-cyan/30"
                          >
                            How It Works
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-3 pt-2">
                    <button 
                      onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                      className="text-xs text-brand-text-muted hover:text-brand-text transition-all flex items-center gap-2"
                    >
                      {mode === 'login' ? <UserPlus size={14} /> : <LogIn size={14} />}
                      <span>{mode === 'login' ? "Don't have an account? Register" : "Already registered? Identity Login"}</span>
                    </button>
                    {mode === 'login' && (
                       <button 
                         onClick={() => setMode('reset')}
                         className="text-[10px] text-brand-text-muted/40 hover:text-brand-text transition-all"
                       >
                         Forgot Password? Reset Access
                       </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="reset"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  <button 
                    onClick={() => setMode('login')}
                    className="flex items-center gap-2 text-brand-text-muted hover:text-brand-text transition-all group"
                  >
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] uppercase tracking-widest font-black">Back to Login</span>
                  </button>

                  <div>
                    <h3 className="text-3xl font-display font-bold text-brand-text tracking-tight">Restore Access</h3>
                    <p className="text-brand-text-muted text-sm mt-2 font-light">Enter your email to receive a restoration link.</p>
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-muted group-focus-within:text-brand-cyan transition-colors" size={18} />
                      <input 
                        type="email" 
                        placeholder="Personnel Email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-cyan/50 focus:border-brand-cyan/50 transition-all"
                      />
                    </div>

                    {error && (
                      <div className={cn(
                        "p-3.5 border rounded-xl flex items-center gap-3 text-xs font-mono",
                        error.includes("sent") ? "bg-brand-cyan/10 border-brand-cyan/20 text-brand-cyan" : "bg-red-500/10 border-red-500/20 text-red-400"
                      )}>
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-brand-cyan text-black font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-brand-cyan/80 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={18} /> : <span>Send Recovery Link</span>}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Footer Disclaimer for Mobile */}
      <div className="w-full px-6 py-6 border-t border-white/5 mt-auto bg-black lg:hidden z-10">
        <p className="text-[9px] text-brand-text-muted leading-relaxed text-center uppercase tracking-widest opacity-40">
          Educational Support Framework • Not a Clinical Service • v1.2.6-admin
        </p>
      </div>
    </div>
  );
}
