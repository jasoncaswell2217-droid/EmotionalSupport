import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageIcon, Trash2, Edit2, Send, X, Heart, MessageSquare, User as UserIcon, Sparkles, Globe, Lock, HelpCircle, ChevronLeft, Loader2, ThumbsUp } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where, or } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { processImageForFeed, ProcessedImage } from '../lib/imageProcessor';
import { BroadcastImage } from './BroadcastImage';

interface FeedPost {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  content: string;
  imageUrl?: string; 
  fullDisplayUrl?: string; 
  timestamp: any;
  isPublic: boolean;
  postType?: 'Changes Made' | 'Upcoming' | 'The Vision';
  userRole?: string;
  reactions?: Record<string, string[]>;
}

interface UserFeedProps {
  user: any;
  userProfile: any;
  role?: string;
  onBack?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const REACTION_TYPES = [
  { emoji: <ThumbsUp size={18} />, label: 'like' }
];

export function UserFeed({ user, userProfile, role, onBack, showToast }: UserFeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [postType, setPostType] = useState<'Post Type' | 'Changes Made' | 'Upcoming' | 'The Vision'>('Post Type');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Changes Made' | 'Upcoming' | 'The Vision'>('All');
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [fullViewImage, setFullViewImage] = useState<string | null>(null);
  const [showPrivacyHelp, setShowPrivacyHelp] = useState(false);

  useEffect(() => {
    let q;
    if (user) {
      q = query(
        collection(db, 'feed'), 
        or(
          where('isPublic', '==', true),
          where('userId', '==', user.uid)
        ),
        orderBy('timestamp', 'desc')
      );
    } else {
      // Logged out: Only show public posts from administrators
      q = query(
        collection(db, 'feed'),
        where('isPublic', '==', true),
        where('userRole', '==', 'admin'),
        orderBy('timestamp', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FeedPost));
      setPosts(fetchedPosts);
    }, (error) => {
      console.error("Feed snapshot error:", error);
      if (error.code !== 'permission-denied') {
        showToast("Feed sync failed", "error");
      }
    });
    return () => unsubscribe();
  }, [user, showToast]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const processed = await processImageForFeed(file);
      setSelectedImage(processed);
      showToast("Media optimized for broadcast", "success");
    } catch (err) {
      console.error("Image processing error:", err);
      showToast("Failed to process image", "error");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleReaction = async (postId: string, reactionType: string) => {
    if (!user) {
      showToast("Login to react", "info");
      return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    try {
      const reactions = { ...(post.reactions || {}) };
      const currentUsers = reactions[reactionType] || [];
      const userIndex = currentUsers.indexOf(user.uid);

      if (userIndex > -1) {
        // Remove reaction
        currentUsers.splice(userIndex, 1);
      } else {
        // Add reaction
        currentUsers.push(user.uid);
      }

      reactions[reactionType] = currentUsers;

      const postRef = doc(db, 'feed', postId);
      await updateDoc(postRef, { reactions });
    } catch (error) {
      console.error("Reaction error:", error);
      showToast("Signal failed to transmit", "error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !selectedImage) return;
    if (!user) return;

    setIsSubmitting(true);
    try {
      const postData: any = {
        content: newPostContent,
        imageUrl: selectedImage?.feedThumb || null,
        fullDisplayUrl: selectedImage?.fullDisplay || null,
        timestamp: Date.now(),
        isPublic: isPublic,
        postType: postType === 'Post Type' ? null : postType,
        userRole: role || 'user',
        reactions: {}
      };

      if (editingPost) {
        const postRef = doc(db, 'feed', editingPost.id);
        const { reactions, ...updateData } = postData; // Don't reset reactions on edit
        await updateDoc(postRef, updateData);
        showToast("Insight updated", "success");
        setEditingPost(null);
      } else {
        postData.userId = user.uid;
        postData.userName = userProfile?.name || user.displayName || 'Anonymous Explorer';
        postData.userAvatar = userProfile?.avatar || user.photoURL || '';
        
        await addDoc(collection(db, 'feed'), postData);
        showToast("Thought shared with the cortex", "success");
      }
      setNewPostContent('');
      setSelectedImage(null);
      setIsPublic(false);
      setPostType('Post Type');
    } catch (error) {
      console.error("Feed submit error:", error);
      showToast("Failed to sync with feed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!postToDelete) return;
    try {
      await deleteDoc(doc(db, 'feed', postToDelete));
      showToast("Memory purged", "info");
      setPostToDelete(null);
    } catch (error) {
      console.error("Delete error:", error);
      showToast("Failed to purge memory", "error");
    }
  };

  const startEdit = (post: FeedPost) => {
    setEditingPost(post);
    setNewPostContent(post.content);
    setSelectedImage(post.imageUrl ? { feedThumb: post.imageUrl, fullDisplay: post.fullDisplayUrl || post.imageUrl } : null);
    setIsPublic(post.isPublic ?? false);
    if (post.postType) {
      setPostType(post.postType as any);
    } else {
      setPostType('Post Type');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setNewPostContent('');
    setSelectedImage(null);
    setIsPublic(false);
    setPostType('Post Type');
  };

    const filteredPosts = activeFilter === 'All' 
      ? posts 
      : posts.filter(p => p.postType === activeFilter);

    const getPostTypeStyles = (type?: string) => {
      switch (type) {
        case 'Changes Made': 
          return {
            container: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]',
            dot: 'bg-emerald-500'
          };
        case 'Upcoming': 
          return {
            container: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]',
            dot: 'bg-brand-purple'
          };
        case 'The Vision': 
          return {
            container: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20 shadow-[0_0_15px_rgba(249,115,22,0.05)]',
            dot: 'bg-brand-orange'
          };
        default: 
          return {
            container: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20 shadow-[0_0_15px_rgba(6,178,210,0.05)]',
            dot: 'bg-brand-cyan'
          };
      }
    };

    return (
      <div className="w-full h-full max-w-6xl mx-auto py-6 sm:py-10 px-4 sm:px-6 md:px-10 space-y-8">
        {/* Category Filter Bar & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-brand-surface/20 border border-brand-border/30 rounded-2xl w-fit">
            {['All', 'Changes Made', 'Upcoming', 'The Vision'].map((cat) => {
              const styles = cat === 'All' ? null : getPostTypeStyles(cat);
              const isActive = activeFilter === cat;
              
              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat as any)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    isActive 
                      ? cat === 'All' ? "bg-brand-cyan text-black" : styles?.container.replace('/10', '/30').replace('/20', '/40')
                      : "text-brand-text-muted hover:text-brand-text hover:bg-brand-surface"
                  )}
                >
                  {cat !== 'All' && styles && (
                    <div className={cn("w-1.5 h-1.5 rounded-full", styles.dot)} />
                  )}
                  {cat}
                </button>
              );
            })}
          </div>

          {!user && (
            <button
              onClick={() => onBack ? onBack() : window.location.reload()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-surface border border-brand-border text-[10px] font-black uppercase tracking-widest text-brand-cyan hover:bg-brand-cyan/5 transition-all"
            >
              <ChevronLeft size={14} />
              Back to Portal
            </button>
          )}
        </div>

        {/* Create Post Card */}
      {user && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-brand-card border border-brand-border rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl backdrop-blur-xl mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-brand-cyan/20 border border-brand-cyan/40 flex items-center justify-center text-brand-cyan shrink-0">
               <Sparkles size={20} />
            </div>
            <h2 className="font-display font-black text-lg sm:text-xl italic tracking-tight text-white uppercase flex items-center gap-2">
              {editingPost ? 'Refine Your Insight' : isPublic ? 'Global Broadcast' : 'Private Broadcast'}
              <button 
                type="button"
                onClick={() => setShowPrivacyHelp(true)}
                className="p-1.5 rounded-full text-white/30 hover:text-brand-cyan hover:bg-brand-cyan/10 transition-all"
                title="Privacy Information"
              >
                <HelpCircle size={16} />
              </button>
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="What's evolving in your cognitive landscape?"
                className="w-full bg-brand-surface border border-brand-border rounded-2xl p-5 text-brand-text min-h-[140px] focus:outline-none focus:border-brand-cyan/50 transition-all resize-none font-sans text-sm sm:text-base leading-relaxed"
              />
              {selectedImage && (
                <div className="mt-4 relative group w-fit max-w-full">
                  <img 
                    src={selectedImage.feedThumb} 
                    alt="Post preview" 
                    className="max-h-[300px] sm:max-h-[400px] w-auto rounded-xl border border-brand-border shadow-2xl cursor-zoom-in" 
                    onClick={() => setFullViewImage(selectedImage.fullDisplay)}
                  />
                  <button 
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <label className={cn(
                    "cursor-pointer flex items-center justify-center p-3.5 rounded-xl bg-brand-surface border border-brand-border text-brand-text-muted transition-all",
                    isProcessingImage ? "opacity-50 pointer-events-none" : "hover:text-brand-cyan hover:bg-brand-cyan/5"
                  )} title="Upload Image">
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={isProcessingImage} />
                    {isProcessingImage ? <Loader2 className="animate-spin" size={22} /> : <ImageIcon size={22} />}
                  </label>

                {/* POST TYPE DROPDOWN */}
                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value as any)}
                  className="bg-brand-surface border border-brand-border rounded-xl px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-brand-text-muted focus:outline-none focus:border-brand-cyan/50 transition-all cursor-pointer hover:bg-brand-surface-2"
                >
                  <option value="Post Type">Post Type</option>
                  <option value="Changes Made">Changes Made</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="The Vision">The Vision</option>
                </select>

                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={cn(
                    "flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border transition-all select-none",
                    isPublic 
                      ? "bg-brand-cyan/20 border-brand-cyan/40 text-brand-cyan shadow-[0_0_15px_rgba(6,178,210,0.2)]" 
                      : "bg-brand-surface border-brand-border/30 text-brand-text-muted hover:bg-brand-surface-2"
                  )}
                  title={isPublic ? "Switch to Private" : "Switch to Global"}
                >
                  <div className={cn(
                    "w-8 h-4 rounded-full relative transition-colors bg-brand-surface-2",
                    isPublic && "bg-brand-cyan/40"
                  )}>
                    <motion.div 
                      animate={{ x: isPublic ? 16 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm"
                    />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 min-w-[50px]">
                    {isPublic ? <Globe size={12} /> : <Lock size={12} />}
                    {isPublic ? 'Global' : 'Private'}
                  </span>
                </button>

                {editingPost && (
                  <button 
                    type="button"
                    onClick={cancelEdit}
                    className="px-6 py-3.5 rounded-xl bg-brand-surface border border-brand-border text-brand-text-muted hover:text-brand-text transition-all text-xs font-bold uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                )}
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting || (!newPostContent.trim() && !selectedImage)}
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4 rounded-xl font-black uppercase text-xs tracking-[0.25em] transition-all active:scale-95 shadow-xl",
                  isSubmitting ? "bg-white/10 text-white/40 cursor-not-allowed" : "bg-brand-cyan text-black hover:shadow-[0_0_30px_rgba(6,178,210,0.4)]"
                )}
              >
                {isSubmitting ? 'Transmitting...' : editingPost ? 'Update' : 'Publish'}
                <Send size={16} />
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Feed List Container */}
      <div className="grid grid-cols-1 gap-6 sm:gap-8 pb-32">
        <AnimatePresence mode="popLayout">
          {filteredPosts.map((post) => {
            const typeStyles = getPostTypeStyles(post.postType);
            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                className="bg-brand-card border border-brand-border rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden backdrop-blur-xl group hover:border-brand-cyan/20 transition-all shadow-lg"
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full border border-brand-border overflow-hidden bg-brand-cyan/10 flex items-center justify-center shrink-0">
                        {post.userAvatar ? (
                          <img src={post.userAvatar} alt={post.userName} className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="text-brand-text-muted opacity-40" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-bold text-base text-brand-text tracking-tight">{post.userName}</h3>
                          {post.postType && (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border flex items-center gap-1.5",
                              typeStyles.container
                            )}>
                              <div className={cn("w-1 h-1 rounded-full", typeStyles.dot)} />
                              {post.postType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-brand-text-muted opacity-50">
                          {new Date(post.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        <span className="w-1 h-1 rounded-full bg-brand-border/20" />
                        <div className="text-[9px] font-mono uppercase tracking-tighter text-brand-text-muted/40 flex items-center gap-1">
                          {post.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                          {post.isPublic ? 'Public' : 'Private'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {post.userId === user?.uid && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => startEdit(post)}
                        className="p-2.5 rounded-xl bg-brand-surface text-brand-text-muted hover:text-brand-cyan hover:bg-brand-cyan/5 transition-all"
                        title="Edit Insight"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setPostToDelete(post.id)}
                        className="p-2.5 rounded-xl bg-brand-surface text-brand-text-muted hover:text-red-400 hover:bg-red-400/5 transition-all"
                        title="Purge Memory"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-brand-text text-base sm:text-lg leading-relaxed whitespace-pre-wrap mb-6 max-w-4xl font-sans font-medium">
                  {post.content}
                </div>

                {post.imageUrl && (
                  <BroadcastImage 
                    src={post.imageUrl} 
                    onExpand={() => setFullViewImage(post.fullDisplayUrl || post.imageUrl || null)}
                    className="mb-6"
                  />
                )}

                <div className="pt-6 border-t border-brand-border/50 flex flex-wrap items-center gap-4 sm:gap-6">
                   {REACTION_TYPES.map(({ emoji, label }) => {
                     const reactionUsers = post.reactions?.[label] || [];
                     const hasReacted = user && reactionUsers.includes(user.uid);
                     const count = reactionUsers.length;

                     return (
                       <button 
                        key={label}
                        onClick={() => handleReaction(post.id, label)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all active:scale-95",
                          hasReacted 
                            ? "bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan shadow-[0_0_10px_rgba(6,178,210,0.1)]" 
                            : "bg-brand-surface/40 border-brand-border/20 text-brand-text-muted hover:border-brand-border"
                        )}
                       >
                         {emoji}
                         {count > 0 && (
                           <span className="text-[10px] font-black font-mono tracking-tighter">
                             {count}
                           </span>
                         )}
                       </button>
                     );
                   })}
                </div>
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {postToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => e.target === e.currentTarget && setPostToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-brand-card border border-red-500/20 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500/0 via-red-500 to-red-500/0" />
              
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                <Trash2 size={40} className="animate-pulse" />
              </div>
              
              <h2 className="font-display font-black text-2xl tracking-tight text-brand-text mb-2 uppercase italic">Purge Status?</h2>
              <p className="text-brand-text-muted text-[11px] font-mono leading-relaxed uppercase tracking-widest opacity-60 mb-8 px-4">
                This collective memory will be removed from the feed forever. Confirm purge?
              </p>
              
              <div className="flex flex-col w-full gap-3">
                <button 
                  onClick={confirmDelete}
                  className="w-full py-4 rounded-2xl bg-red-500 text-white font-black uppercase text-xs tracking-[0.3em] shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95"
                >
                  Confirm Delete
                </button>
                <button 
                  onClick={() => setPostToDelete(null)}
                  className="w-full py-4 rounded-2xl bg-brand-surface border border-brand-border text-brand-text-muted font-black uppercase text-xs tracking-[0.3em] hover:bg-brand-surface-2 transition-all active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy Help Modal */}
      <AnimatePresence>
        {showPrivacyHelp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowPrivacyHelp(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-brand-card border border-brand-border rounded-[2.5rem] p-8 shadow-2xl text-center relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-brand-cyan/50" />
              
              <div className="w-16 h-16 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center mx-auto mb-6 text-brand-cyan shadow-[0_0_30px_rgba(6,178,210,0.1)]">
                <HelpCircle size={32} />
              </div>
              
              <h3 className="font-display font-black text-xl italic tracking-tight text-brand-text uppercase mb-4">Privacy Guide</h3>
              
              <div className="space-y-4 text-left">
                <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border/30">
                  <p className="text-brand-text text-sm leading-relaxed">
                    <span className="text-brand-cyan font-bold uppercase text-[10px] tracking-widest block mb-1">Private Broadcast</span>
                    Only you can see this.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border/30">
                  <p className="text-brand-text text-sm leading-relaxed">
                    <span className="text-brand-cyan font-bold uppercase text-[10px] tracking-widest block mb-1">Global Broadcast</span>
                    Everyone that views your broadcasts can see this.
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowPrivacyHelp(false)}
                className="mt-8 w-full py-4 rounded-2xl bg-brand-cyan text-black font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-brand-cyan/20 hover:shadow-[0_0_20px_rgba(6,178,210,0.4)] transition-all active:scale-95"
              >
                Ok
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full View Image Modal */}
      <AnimatePresence>
        {fullViewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-10 bg-black/95 backdrop-blur-xl"
            onClick={() => setFullViewImage(null)}
          >
            <motion.button 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute top-6 right-6 p-4 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all hover:rotate-90 z-[310]"
              onClick={() => setFullViewImage(null)}
            >
              <X size={32} />
            </motion.button>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center"
            >
              <img 
                src={fullViewImage} 
                alt="Full size view" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
