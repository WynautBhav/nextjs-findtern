'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ExpandableCardProps {
  imageSrc?: string;
  /** Replaces the photo entirely. Used where there is no real photo URL, so
   *  the card never renders a stranger's face or a broken image. */
  hero?: React.ReactNode;
  title?: string;
  subtitle?: string;
  content?: React.ReactNode;
}

export default function ExpandableProfileCard({
  imageSrc,
  hero,
  title = "Jane Doe",
  subtitle = "Senior UX Designer",
  content
}: ExpandableCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const layoutId = `expandable-profile-card-${title}`;

  // Close on Escape, so the modal is not a keyboard trap.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <>
      <motion.div
        layoutId={layoutId}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(true); } }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${title}'s profile`}
        className="cursor-pointer relative h-64 w-full overflow-hidden rounded-xl border border-border group shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        whileHover="hover"
      >
        {hero ? (
          <div className="absolute inset-0">{hero}</div>
        ) : imageSrc ? (
          <motion.img
            layoutId={`image-${layoutId}`}
            src={imageSrc}
            className="absolute inset-0 h-full w-full object-cover"
            variants={{
              hover: { scale: 1.05 }
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

        <div className="absolute bottom-0 left-0 p-5 sm:p-6 w-full translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
          <motion.p layoutId={`subtitle-${layoutId}`} className={`text-xs font-medium tracking-wide uppercase mb-1.5 ${hero ? "text-accent-300" : "text-primary"}`}>{subtitle}</motion.p>
          <motion.h3 layoutId={`title-${layoutId}`} className={`text-lg sm:text-xl font-semibold tracking-tight ${hero ? "text-white" : "text-foreground"}`}>{title}</motion.h3>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />
            <motion.div
              layoutId={layoutId}
              role="dialog"
              aria-modal="true"
              aria-label={`${title} profile`}
              className="relative w-full max-w-4xl h-[80vh] bg-card rounded-2xl overflow-hidden border border-border z-10 flex flex-col md:flex-row shadow-xl"
            >
              <button 
                onClick={() => setIsOpen(false)} 
                className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center bg-background/50 hover:bg-accent rounded-full border border-border text-foreground transition-colors backdrop-blur-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              
              <div className="relative h-64 w-full shrink-0 overflow-hidden md:h-full md:w-1/2 bg-brand-950">
                {hero ? (
                  <motion.div layoutId={`image-${layoutId}`} className="h-full w-full">{hero}</motion.div>
                ) : imageSrc ? (
                  <motion.img
                    layoutId={`image-${layoutId}`}
                    src={imageSrc}
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent md:hidden" />
              </div>
              
              <div className="p-6 sm:p-8 w-full md:w-1/2 flex flex-col h-full overflow-y-auto custom-scrollbar">
                <motion.p layoutId={`subtitle-${layoutId}`} className="text-primary text-xs font-medium tracking-wide uppercase mb-3">{subtitle}</motion.p>
                <motion.h3 layoutId={`title-${layoutId}`} className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-6 pb-4 border-b border-border">{title}</motion.h3>
                
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: 0.2 }}
                  className="text-foreground/80 text-sm leading-relaxed grow"
                >
                  {content || (
                    <div className="flex flex-col gap-6">
                      <p>A passionate UX/UI designer with over 8 years of experience creating intuitive digital products. I specialize in bridging the gap between complex systems and user-friendly interfaces.</p>
                      
                      <div>
                        <h4 className="text-foreground font-semibold tracking-tight mb-2">Background</h4>
                        <p className="text-muted-foreground">Previously led design teams at top fintech startups, focusing on accessibility, seamless transactions, and inclusive design.</p>
                      </div>

                      <div>
                        <h4 className="text-foreground font-semibold tracking-tight mb-2">Current Focus</h4>
                        <p className="text-muted-foreground">Currently exploring the intersection of AI and user experience, building tools that empower creators and simplify daily workflows.</p>
                      </div>
                      
                      <button className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition-opacity self-start shadow-sm">
                        Connect with Jane
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
