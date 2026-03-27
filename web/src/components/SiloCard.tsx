import { Link } from "react-router-dom";

interface SiloCardProps {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string | null;
  status: "live" | "soon";
  color: string;
  iconBg: string;
  stats?: { value: number; label: string };
}

export default function SiloCard({
  id,
  title,
  description,
  icon,
  href,
  status,
  color,
  iconBg,
  stats,
}: SiloCardProps) {
  const isLive = status === "live";

  const card = (
    <div
      className={`card border-2 h-full flex flex-col gap-3 transition-all ${color} ${
        isLive ? "hover:shadow-md cursor-pointer" : "opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${iconBg}`}>
          {icon}
        </div>
        <span
          className={`badge text-xs mt-1 ${
            isLive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {isLive ? "Live" : "Bald verfügbar"}
        </span>
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 text-base mb-1">{title}</h2>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
      {isLive && stats && stats.value > 0 && (
        <div className="mt-auto pt-3 border-t border-gray-100 text-sm text-gray-500">
          {stats.value.toLocaleString("de-DE")} {stats.label}
        </div>
      )}
      {isLive && (
        <div className="mt-auto text-sm font-medium text-brand-600">
          Erkunden →
        </div>
      )}
    </div>
  );

  return isLive && href ? (
    <Link key={id} to={href} className="flex">
      {card}
    </Link>
  ) : (
    <div key={id}>{card}</div>
  );
}
