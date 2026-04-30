import { motion } from 'framer-motion';

const columns = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 5.8) % 100}%`,
  delay: (index % 6) * 0.5,
  duration: 9 + (index % 5),
  text: index % 3 === 0 ? '0101 HASH NODE TRUST' : index % 3 === 1 ? 'LEDGER VERIFY BLOCK' : 'SIGNAL RISK PROOF',
}));

export default function MatrixBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(0,255,136,0.12),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(112,255,190,0.08),transparent_28%),linear-gradient(180deg,#030806_0%,#07100d_48%,#030806_100%)]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,6,0.78),transparent_30%,transparent_70%,rgba(3,8,6,0.78))]" />

      {columns.map((column) => (
        <motion.div
          key={column.id}
          className="absolute top-[-35%] w-5 break-all font-mono text-[11px] leading-5 text-tp-green/20"
          style={{ left: column.left }}
          initial={{ y: '-20%' }}
          animate={{ y: '150%' }}
          transition={{ duration: column.duration, delay: column.delay, repeat: Infinity, ease: 'linear' }}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} className={index % 4 === 0 ? 'text-emerald-100/28' : ''}>
              {column.text}
            </span>
          ))}
        </motion.div>
      ))}
    </div>
  );
}
