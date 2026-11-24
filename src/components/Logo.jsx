// Logo — chat bubble whose tail extends into a shield point, with a checkmark inside.
// Props: size (default 32), color (default 'currentColor'), className

export default function Logo({ size = 32, color = '#EFE8F4', className }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 44 / 40)}
      viewBox="0 0 40 44"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10 0 L30 0 Q40 0 40 10 L40 22 Q40 32 30 32 L26 32 L20 44 L14 32 L10 32 Q0 32 0 22 L0 10 Q0 0 10 0 Z"
        fill={color}
      />
      <path
        d="M11 17 L17 23 L29 11"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
