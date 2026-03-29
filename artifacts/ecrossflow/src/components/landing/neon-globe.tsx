import React, { useEffect, useId, useMemo, useState } from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldCountries110m from "world-atlas/countries-110m.json";

type GeoFeature = {
  type: string;
  geometry: unknown;
};

function buildWorldFeatures(): GeoFeature[] {
  const topology = worldCountries110m as {
    objects?: Record<string, unknown>;
  };
  const countriesObject = topology.objects?.countries;
  if (!countriesObject) return [];
  const geo = feature(topology as never, countriesObject as never) as {
    features?: GeoFeature[];
  };
  return geo.features || [];
}

export function NeonGlobe(): React.JSX.Element {
  const size = 920;
  const center = size / 2;
  const radius = size * 0.33;
  const idSeed = useId().replace(/:/g, "");
  const [rotation, setRotation] = useState(0);

  const countries = useMemo(() => buildWorldFeatures(), []);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let buffer = 0;
    const animate = (now: number) => {
      const dt = now - last;
      last = now;
      buffer += dt;
      if (buffer >= 33) {
        // Vertical axis spin: longitude rotation around north/south axis.
        setRotation((prev) => (prev + buffer * 0.0115) % 360);
        buffer = 0;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([center, center])
        .scale(radius)
        .rotate([rotation - 18, -13, 0])
        .clipAngle(90),
    [center, radius, rotation],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const spherePath = useMemo(() => path({ type: "Sphere" }), [path]);
  const graticulePath = useMemo(() => path(geoGraticule10()), [path]);
  const countryPaths = useMemo(
    () => countries.map((country, index) => ({ id: `c-${index}`, d: path(country as never) })).filter((item) => !!item.d),
    [countries, path],
  );

  return (
    <div className="relative h-[620px] w-[620px] max-w-[85vw] opacity-95 sm:h-[760px] sm:w-[760px] lg:h-[900px] lg:w-[900px]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(36,237,197,0.28)_0%,rgba(64,184,255,0.14)_40%,rgba(0,0,0,0)_72%)] blur-2xl" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(92,255,244,0.2)_8%,rgba(0,0,0,0)_58%)] blur-3xl animate-pulse" />
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`ecf-neon-globe-fill-${idSeed}`} cx="36%" cy="32%">
            <stop offset="0%" stopColor="rgba(158,255,236,0.58)" />
            <stop offset="36%" stopColor="rgba(56,220,188,0.28)" />
            <stop offset="72%" stopColor="rgba(21,67,89,0.9)" />
            <stop offset="100%" stopColor="rgba(8,21,34,0.98)" />
          </radialGradient>
          <linearGradient id={`ecf-neon-terminator-${idSeed}`} x1="14%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="66%" stopColor="rgba(5,11,16,0.1)" />
            <stop offset="100%" stopColor="rgba(2,7,12,0.34)" />
          </linearGradient>
          <filter id={`ecf-neon-soft-glow-${idSeed}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5.8" result="blurred" />
            <feColorMatrix
              in="blurred"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0.18  0 0 1 0 0.14  0 0 0 1 0"
              result="tinted"
            />
            <feMerge>
              <feMergeNode in="tinted" />
              <feMergeNode in="blurred" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`ecf-neon-strong-glow-${idSeed}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9.6" result="blurredStrong" />
            <feMerge>
              <feMergeNode in="blurredStrong" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={`ecf-neon-globe-clip-${idSeed}`}>
            {spherePath ? <path d={spherePath} /> : null}
          </clipPath>
        </defs>

        {spherePath ? (
          <>
            <path
              d={spherePath}
              fill={`url(#ecf-neon-globe-fill-${idSeed})`}
              stroke="rgba(124,234,210,0.66)"
              strokeWidth={1.72}
            />
            <path
              d={spherePath}
              fill="none"
              stroke="rgba(150,245,255,0.98)"
              strokeWidth={4.6}
              filter={`url(#ecf-neon-strong-glow-${idSeed})`}
            />
            <path
              d={spherePath}
              fill="none"
              stroke="rgba(128,255,236,0.56)"
              strokeWidth={2.1}
              filter={`url(#ecf-neon-soft-glow-${idSeed})`}
            />
          </>
        ) : null}

        <g clipPath={`url(#ecf-neon-globe-clip-${idSeed})`}>
          {graticulePath ? (
            <path
              d={graticulePath}
              fill="none"
              stroke="rgba(120,190,255,0.22)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {countryPaths.map((item) => (
            <path
              key={item.id}
              d={item.d || ""}
              fill="rgba(65,223,192,0.17)"
              stroke="rgba(168,255,238,0.62)"
              strokeWidth={0.7}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={spherePath || ""} fill={`url(#ecf-neon-terminator-${idSeed})`} />
        </g>

        <ellipse
          cx={center}
          cy={center + radius + 35}
          rx={radius * 0.84}
          ry={34}
          fill="rgba(35,198,164,0.3)"
          filter={`url(#ecf-neon-soft-glow-${idSeed})`}
        />
        {spherePath ? (
          <path
            d={spherePath}
            fill="none"
            stroke="rgba(121,232,255,0.35)"
            strokeWidth={8.4}
            filter={`url(#ecf-neon-soft-glow-${idSeed})`}
          />
        ) : null}
      </svg>
      <div className="absolute left-1/2 top-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#7cead2]/36 shadow-[0_0_48px_rgba(100,255,230,0.26)]" />
      <div className="absolute left-1/2 top-1/2 h-[95%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#7bcfff]/22" />
    </div>
  );
}
