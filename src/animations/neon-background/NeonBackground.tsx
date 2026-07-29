import "./neon-background.css";

type Tendril = {
  color: string;
  d: string;
  opacity: number;
  width: number;
};

type Spark = {
  color: string;
  delay: string;
  duration: string;
  id: string;
  left?: string;
  right?: string;
  size: number;
  top: string;
};

const LEFT_TENDRILS: readonly Tendril[] = [
  {
    color: "var(--neon-4)",
    d: "M-18 34 C92 12 158 96 118 214 S20 358 86 498 S212 690 18 858",
    opacity: 0.34,
    width: 0.72
  },
  {
    color: "var(--neon-3)",
    d: "M42-36 C166 108 34 214 104 344 S258 482 108 624 S32 804 194 938",
    opacity: 0.28,
    width: 0.58
  },
  {
    color: "var(--neon-1)",
    d: "M-58 168 C82 132 246 172 190 304 S24 442 136 584 S250 712 68 924",
    opacity: 0.24,
    width: 0.5
  },
  {
    color: "var(--neon-warm)",
    d: "M-6 426 C112 362 224 394 166 512 S18 650 106 762 S222 862 246 934",
    opacity: 0.38,
    width: 0.82
  },
  {
    color: "var(--neon-2)",
    d: "M184-30 C72 82 264 170 172 302 S94 472 246 562 S286 760 144 928",
    opacity: 0.22,
    width: 0.46
  }
];

const RIGHT_TENDRILS: readonly Tendril[] = [
  {
    color: "var(--neon-3)",
    d: "M378 24 C230 88 188 164 250 266 S382 408 266 522 S160 704 346 904",
    opacity: 0.34,
    width: 0.74
  },
  {
    color: "var(--neon-4)",
    d: "M314-34 C202 102 332 216 252 330 S102 476 238 598 S326 792 174 936",
    opacity: 0.28,
    width: 0.54
  },
  {
    color: "var(--neon-warm)",
    d: "M414 188 C276 130 112 180 174 316 S340 446 226 592 S108 734 286 926",
    opacity: 0.4,
    width: 0.88
  },
  {
    color: "var(--neon-1)",
    d: "M368 420 C252 360 136 402 198 520 S340 654 244 758 S116 858 88 936",
    opacity: 0.24,
    width: 0.5
  },
  {
    color: "var(--neon-2)",
    d: "M172-26 C286 84 92 176 190 304 S270 474 114 566 S70 756 214 930",
    opacity: 0.22,
    width: 0.46
  }
];

const SPARKS: readonly Spark[] = [
  {
    color: "var(--neon-warm)",
    delay: "-1.2s",
    duration: "7.4s",
    id: "spark-1",
    left: "5%",
    size: 4,
    top: "13%"
  },
  {
    color: "var(--neon-3)",
    delay: "-4.6s",
    duration: "9.2s",
    id: "spark-2",
    left: "14%",
    size: 3,
    top: "31%"
  },
  {
    color: "var(--neon-4)",
    delay: "-2.8s",
    duration: "6.8s",
    id: "spark-3",
    left: "7%",
    size: 5,
    top: "68%"
  },
  {
    color: "var(--neon-1)",
    delay: "-6.1s",
    duration: "10.6s",
    id: "spark-4",
    left: "17%",
    size: 2,
    top: "86%"
  },
  {
    color: "var(--neon-3)",
    delay: "-3.7s",
    duration: "8.8s",
    id: "spark-5",
    right: "6%",
    size: 4,
    top: "17%"
  },
  {
    color: "var(--neon-warm)",
    delay: "-5.2s",
    duration: "10.2s",
    id: "spark-6",
    right: "15%",
    size: 3,
    top: "43%"
  },
  {
    color: "var(--neon-4)",
    delay: "-1.9s",
    duration: "7.8s",
    id: "spark-7",
    right: "8%",
    size: 5,
    top: "69%"
  },
  {
    color: "var(--neon-1)",
    delay: "-7.1s",
    duration: "11s",
    id: "spark-8",
    right: "18%",
    size: 3,
    top: "87%"
  }
];

function EdgeTendrils({
  className,
  tendrils
}: {
  className: string;
  tendrils: readonly Tendril[];
}) {
  return (
    <svg
      className={`neon-bg__edge ${className}`}
      preserveAspectRatio="none"
      viewBox="0 0 360 900"
    >
      {tendrils.map((tendril, index) => (
        <path
          key={`${className}-${index}`}
          d={tendril.d}
          fill="none"
          opacity={tendril.opacity}
          stroke={tendril.color}
          strokeLinecap="round"
          strokeWidth={tendril.width}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function NeonBackground() {
  return (
    <div aria-hidden="true" className="neon-bg">
      <EdgeTendrils
        className="neon-bg__edge--left"
        tendrils={LEFT_TENDRILS}
      />
      <EdgeTendrils
        className="neon-bg__edge--right"
        tendrils={RIGHT_TENDRILS}
      />
      {SPARKS.map((spark) => (
        <span
          key={spark.id}
          className="neon-bg__spark"
          style={{
            animationDelay: spark.delay,
            animationDuration: spark.duration,
            backgroundColor: spark.color,
            height: spark.size,
            left: spark.left,
            right: spark.right,
            top: spark.top,
            width: spark.size
          }}
        />
      ))}
    </div>
  );
}
