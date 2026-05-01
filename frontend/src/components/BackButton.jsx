import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Smart back button:
//  - If we got here via in-app navigation, go back one step.
//  - Otherwise (deep-link / hard refresh), fall back to `to` (default `/`).
export default function BackButton({ to = '/', label = 'Back', className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick() {
    const cameFromInApp =
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      location.key !== 'default';
    if (cameFromInApp) navigate(-1);
    else navigate(to);
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileHover={{ x: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={`group inline-flex items-center gap-2 rounded-xl border border-emerald-300/14
                  bg-emerald-300/[0.04] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em]
                  text-emerald-100/58 transition-all
                  hover:border-tp-green/35 hover:bg-tp-green/[0.08] hover:text-tp-green
                  hover:shadow-[0_0_14px_rgba(0,255,136,0.18)] ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
      >
        <path d="M10 12L6 8L10 4" />
      </svg>
      {label}
    </motion.button>
  );
}
